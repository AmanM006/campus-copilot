// server/agents/extractionAgent.js
// ─── Extraction Agent ─────────────────────────────────────────────────────────
// Responsibility: read the current page and extract structured data.
// ALL extraction logic is adaptive — tries multiple DOM strategies.
// No hardcoded subject names, column indices, or class names.

/**
 * extractAttendance — extracts attendance table from any portal layout.
 * Returns: [{ subject, code, attended, total, percentage, teacher? }]
 */
async function extractAttendance(page, emit = () => {}) {
  emit({ type: "info", msg: "Scanning page for attendance data…", group: "extraction" });

  try {
    // Strategy 1: structured table rows
    const rows = await page.evaluate(() => {
      const results = [];
      const tables  = document.querySelectorAll("table");

      for (const table of tables) {
        const trs = table.querySelectorAll("tr");
        for (const tr of trs) {
          const cells = [...tr.querySelectorAll("td, th")].map(c => c.innerText.trim());
          if (cells.length < 3) continue;

          const cellText = cells.join(" ").toLowerCase();
          // Row contains attendance-related data
          if (cellText.match(/\d{1,3}(\.\d{1,2})?\s*%/) ||
              (cellText.includes("/") && cellText.match(/\d+\/\d+/))) {

            // Try to parse: subject | code | attended | total | %
            const pct = cells.find(c => c.match(/\d{1,3}(\.\d{1,2})?\s*%/));
            const fraction = cells.find(c => c.match(/^\d+\/\d+$/));
            let attended = null, total = null, percentage = null;

            if (fraction) {
              const [a, t] = fraction.split("/").map(Number);
              attended = a; total = t;
              percentage = t > 0 ? Math.round((a / t) * 100 * 100) / 100 : 0;
            } else if (pct) {
              percentage = parseFloat(pct.replace("%", "").trim());
            }

            // Find numeric columns for attended/total
            const nums = cells.filter(c => /^\d+$/.test(c.trim())).map(Number);
            if (nums.length >= 2 && !attended) {
              attended = nums[0]; total = nums[1];
              if (!percentage) percentage = total > 0 ? Math.round((attended / total) * 10000) / 100 : 0;
            }

            if (percentage === null && !attended) continue;

            // Subject name — longest non-numeric cell (usually first or second)
            const nonNumeric = cells.filter(c => !/^\d+(\.\d+)?%?$/.test(c.trim()) && c.length > 2);
            const subject = nonNumeric[0] || cells[0] || "Unknown";
            const code    = nonNumeric.find(c => /^[A-Z]{2,4}\s*\d{3,4}/i.test(c)) || "";

            results.push({ subject, code, attended, total, percentage });
          }
        }
      }
      return results;
    });

    // Strategy 2: SLCM-specific (.attendance-data, .subject-row, etc.)
    if (rows.length === 0) {
      const slcmRows = await page.evaluate(() => {
        const results = [];
        // Common SLCM/ERP class names
        const selectors = [
          ".attendance-row",".subject-attendance",".att-row",
          "[data-attendance]","[class*='attendance']","[class*='subject']",
        ];

        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length === 0) continue;
          for (const el of els) {
            const text = el.innerText.trim();
            if (text) results.push({ raw: text });
          }
          if (results.length > 0) break;
        }
        return results;
      });

      if (slcmRows.length > 0) {
        emit({ type: "info", msg: `Found ${slcmRows.length} attendance entries (SLCM layout)`, group: "extraction" });
        return slcmRows;
      }
    }

    // Strategy 3: extract all % values with context from page text
    if (rows.length === 0) {
      const textBlocks = await page.evaluate(() => {
        const text = document.body.innerText;
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 2);
        const results = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.match(/\d{1,3}(\.\d{1,2})?\s*%/)) {
            results.push({
              subject: lines[i - 1] || "Unknown",
              percentage: parseFloat(line.match(/(\d{1,3}(\.\d{1,2})?)\s*%/)?.[1] || "0"),
            });
          }
        }
        return results;
      });
      if (textBlocks.length > 0) return textBlocks;
    }

    emit({ type: "success", msg: `Extracted ${rows.length} attendance records`, group: "extraction" });
    return rows;

  } catch (err) {
    emit({ type: "error", msg: `Attendance extraction error: ${err.message}`, group: "extraction" });
    return [];
  }
}

/**
 * extractSubjects — same page as attendance (subjects ARE attendance rows).
 * Returns [{ name, code, teacher? }]
 */
async function extractSubjects(page, emit = () => {}) {
  emit({ type: "info", msg: "Extracting subject list…", group: "extraction" });
  const attendance = await extractAttendance(page, emit);

  // Subjects are unique subject names from attendance rows
  const seen = new Set();
  return attendance
    .filter(row => {
      const key = (row.code || row.subject || "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    })
    .map(row => ({ name: row.subject, code: row.code || "", teacher: row.teacher || "" }));
}

/**
 * extractProfile — scrape student profile information.
 */
async function extractProfile(page, emit = () => {}) {
  emit({ type: "info", msg: "Extracting student profile…", group: "extraction" });
  try {
    return await page.evaluate(() => {
      const text = document.body.innerText;

      // Registration number patterns
      const regMatch  = text.match(/\b(\d{3}[A-Z]{2}\d{4,5})\b/i);
      const nameMatch = text.match(/(?:Name|Student Name)\s*[:\-]?\s*([A-Za-z\s]{4,40})/i);
      const semMatch  = text.match(/(?:Semester|Sem)\s*[:\-]?\s*(\d{1,2})/i);
      const cgpaMatch = text.match(/(?:CGPA|GPA)\s*[:\-]?\s*([\d.]+)/i);

      return {
        registrationNo: regMatch?.[1]    || null,
        name:           nameMatch?.[1]?.trim() || null,
        semester:       semMatch?.[1]    ? parseInt(semMatch[1]) : null,
        cgpa:           cgpaMatch?.[1]   ? parseFloat(cgpaMatch[1]) : null,
      };
    });
  } catch (err) {
    emit({ type: "warn", msg: `Profile extraction failed: ${err.message}`, group: "extraction" });
    return {};
  }
}

async function extractCGPAAndMarks(page, emit) {
emit({ type: "info", msg: "Extracting CGPA + Marks…", group: "extraction" });

return await page.evaluate(() => {
  const text = document.body.innerText;

  // 🔥 CGPA detection (VERY IMPORTANT)
  const cgpaMatch = text.match(/CGPA\s*[:\-]?\s*(\d+(\.\d+)?)/i);

  const cgpa = cgpaMatch ? parseFloat(cgpaMatch[1]) : null;

  // 🔥 Table extraction
  const rows = [];

  document.querySelectorAll("table tr").forEach(tr => {
    const cells = [...tr.querySelectorAll("td, th")].map(c => c.innerText.trim());

    if (cells.length >= 3) {
      const hasMarks = cells.some(c => /\d{1,3}/.test(c));
      if (hasMarks) {
        rows.push({
          subject: cells[0],
          marks: cells[1],
          grade: cells.find(c => /[A-F][+\-]?/.test(c)) || ""
        });
      }
    }
  });

  return {
    cgpa,
    marks: rows
  };
});
}

/**
 * extractTimetable — extract weekly schedule from the portal.
 */
async function extractTimetable(page, emit = () => {}) {
  emit({ type: "info", msg: "Extracting timetable…", group: "extraction" });
  try {
    return await page.evaluate(() => {
      const results = [];
      const tables  = document.querySelectorAll("table");
      const days    = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

      for (const table of tables) {
        const text = table.innerText.toLowerCase();
        if (!days.some(d => text.includes(d.toLowerCase()))) continue;

        const rows = table.querySelectorAll("tr");
        let headers = []; // <-- FIX: Removed the : string[] annotation

        for (const row of rows) {
          const cells = [...row.querySelectorAll("td,th")].map(c => c.innerText.trim());
          if (cells.some(c => days.some(d => c.includes(d)))) {
            headers = cells;
            continue;
          }
          if (cells.length >= 2) {
            const timeMatch = cells[0]?.match(/(\d{1,2}:\d{2})/);
            if (timeMatch) {
              cells.slice(1).forEach((cell, i) => {
                if (cell.trim() && headers[i + 1]) {
                  results.push({ day: headers[i + 1], time: cells[0], subject: cell });
                }
              });
            }
          }
        }
        if (results.length > 0) break;
      }
      return results;
    });
  } catch (err) {
    emit({ type: "warn", msg: `Timetable extraction failed: ${err.message}`, group: "extraction" });
    return [];
  }
}

/**
 * extractGeneric — fallback: return visible text + all tables.
 */
async function extractGeneric(page, emit = () => {}) {
  emit({ type: "info", msg: "Running generic extraction…", group: "extraction" });
  try {
    const [text, tables] = await Promise.all([
      page.evaluate(() => document.body.innerText.slice(0, 4000)),
      page.evaluate(() =>
        [...document.querySelectorAll("table")]
          .slice(0, 5)
          .map(t => [...t.querySelectorAll("tr")]
            .slice(0, 20)
            .map(r => [...r.querySelectorAll("td,th")].map(c => c.innerText.trim()))
            .filter(r => r.some(c => c.length > 0))
          )
      ),
    ]);
    return { text, tables };
  } catch {
    return { text: "", tables: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extractionAgent — dispatches to the right extractor
// ─────────────────────────────────────────────────────────────────────────────
async function extractionAgent(page, action, emit = () => {}) {
  emit({ type: "info", msg: `Extraction agent: ${action}`, group: "extraction" });

  switch (action) {
    case "attendance":  return await extractAttendance(page, emit);
    case "subjects":    return await extractSubjects(page, emit);
    case "profile":     return await extractProfile(page, emit);
    case "timetable":   return await extractTimetable(page, emit);
    default:            return await extractGeneric(page, emit);
  }
}

module.exports = { extractionAgent, extractAttendance, extractSubjects, extractProfile, extractTimetable, extractGeneric };