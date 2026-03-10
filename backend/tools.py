def get_lab_tools():
    return [
        # ─────────────────────────────────────────────
        # LAB & RESOURCE BOOKING
        # ─────────────────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "book_lab_slot",
                "description": "Books a specific lab slot for the student. Use when student asks to book/reserve/schedule any lab.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "lab_name": {
                            "type": "string",
                            "description": "The name of the lab (e.g., Robotics, OSDL, Physics, CNC, Electronics)"
                        },
                        "date": {
                            "type": "string",
                            "description": "The date for the booking in YYYY-MM-DD format"
                        },
                        "slot": {
                            "type": "string",
                            "enum": ["morning", "afternoon", "evening"],
                            "description": "The time slot preference"
                        },
                        "purpose": {
                            "type": "string",
                            "description": "Brief reason for booking, e.g. project work, assignment, research"
                        }
                    },
                    "required": ["lab_name", "date"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "check_lab_availability",
                "description": "Checks which slots are available for a given lab on a specific date. Use when student asks 'is the robotics lab free tomorrow?' or 'when can I book the physics lab?'",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "lab_name": {
                            "type": "string",
                            "description": "The name of the lab to check"
                        },
                        "date": {
                            "type": "string",
                            "description": "The date to check availability in YYYY-MM-DD format"
                        }
                    },
                    "required": ["lab_name", "date"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "cancel_lab_booking",
                "description": "Cancels an existing lab booking for the student.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "booking_id": {
                            "type": "string",
                            "description": "The booking ID to cancel. If not known, provide lab_name and date instead."
                        },
                        "lab_name": {
                            "type": "string",
                            "description": "The name of the lab (fallback if no booking_id)"
                        },
                        "date": {
                            "type": "string",
                            "description": "The date of the booking to cancel in YYYY-MM-DD format"
                        }
                    },
                    "required": []
                }
            }
        },

        # ─────────────────────────────────────────────
        # ATTENDANCE
        # ─────────────────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "get_attendance",
                "description": "Fetches the student's attendance percentage for all subjects or a specific subject. Use when student asks about their attendance, bunk limit, or how many classes they can miss.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "subject_code": {
                            "type": "string",
                            "description": "Specific subject code (e.g., CSE301). If omitted, returns all subjects."
                        },
                        "semester": {
                            "type": "string",
                            "description": "Semester identifier, e.g. '5' or 'current'. Defaults to current semester."
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_attendance_bunk_calculator",
                "description": "Calculates how many more classes a student can safely miss (bunk) while staying above the 75% attendance threshold. Also calculates how many consecutive classes they need to attend to recover attendance.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "subject_code": {
                            "type": "string",
                            "description": "Specific subject code. If omitted, calculates for all subjects."
                        }
                    },
                    "required": []
                }
            }
        },

        # ─────────────────────────────────────────────
        # ACADEMIC RECORDS
        # ─────────────────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "get_grades",
                "description": "Fetches the student's grades, GPA, or CGPA. Use when asked about marks, grades, results, or academic performance.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "semester": {
                            "type": "string",
                            "description": "Semester number (e.g., '4') or 'all' for complete academic record. Defaults to latest."
                        },
                        "subject_code": {
                            "type": "string",
                            "description": "Specific subject code to get grades for. Optional."
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_exam_schedule",
                "description": "Fetches the student's upcoming exam timetable. Use when asked about exam dates, seating arrangement, or hall ticket.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exam_type": {
                            "type": "string",
                            "enum": ["midsem", "endsem", "internals", "all"],
                            "description": "Type of exam to fetch schedule for."
                        },
                        "semester": {
                            "type": "string",
                            "description": "Semester identifier. Defaults to current."
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_timetable",
                "description": "Fetches the student's class timetable. Use when asked about today's schedule, tomorrow's classes, weekly timetable, or which class is next.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "day": {
                            "type": "string",
                            "description": "Day of the week (e.g., 'Monday', 'today', 'tomorrow'). Defaults to today."
                        },
                        "week": {
                            "type": "string",
                            "enum": ["current", "next"],
                            "description": "Week to fetch. Defaults to current week."
                        }
                    },
                    "required": []
                }
            }
        },

        # ─────────────────────────────────────────────
        # FEES & FINANCES
        # ─────────────────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "get_fee_status",
                "description": "Checks the student's fee payment status, outstanding dues, and upcoming payment deadlines. Use when asked about fees, dues, challan, or payment.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "fee_type": {
                            "type": "string",
                            "enum": ["tuition", "hostel", "mess", "all"],
                            "description": "Category of fee to check. Defaults to all."
                        }
                    },
                    "required": []
                }
            }
        },

        # ─────────────────────────────────────────────
        # GRIEVANCES & REQUESTS
        # ─────────────────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "raise_grievance",
                "description": "Submits a formal grievance or complaint to the relevant department. Use when student wants to report an issue, complaint, or concern.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": ["academic", "hostel", "infrastructure", "faculty", "administrative", "other"],
                            "description": "Category of the grievance."
                        },
                        "subject": {
                            "type": "string",
                            "description": "Brief subject line of the grievance."
                        },
                        "description": {
                            "type": "string",
                            "description": "Detailed description of the issue."
                        },
                        "urgency": {
                            "type": "string",
                            "enum": ["low", "medium", "high"],
                            "description": "Urgency level. Defaults to medium."
                        }
                    },
                    "required": ["category", "subject", "description"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "request_bonafide_certificate",
                "description": "Submits a request for a bonafide certificate, enrollment letter, or other official academic document.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "document_type": {
                            "type": "string",
                            "enum": ["bonafide", "enrollment", "transcript", "migration", "character_certificate"],
                            "description": "Type of document requested."
                        },
                        "purpose": {
                            "type": "string",
                            "description": "Purpose for which the document is needed (e.g., bank account, visa application, scholarship)."
                        },
                        "urgency": {
                            "type": "string",
                            "enum": ["normal", "urgent"],
                            "description": "Processing urgency. Urgent may incur additional fees."
                        }
                    },
                    "required": ["document_type", "purpose"]
                }
            }
        },

        # ─────────────────────────────────────────────
        # CAMPUS SERVICES
        # ─────────────────────────────────────────────
        {
            "type": "function",
            "function": {
                "name": "get_mess_menu",
                "description": "Fetches the hostel mess menu for today or upcoming days. Use when asked about today's food, lunch menu, mess schedule.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "day": {
                            "type": "string",
                            "description": "Day to fetch menu for. e.g. 'today', 'tomorrow', 'Monday'. Defaults to today."
                        },
                        "meal": {
                            "type": "string",
                            "enum": ["breakfast", "lunch", "dinner", "all"],
                            "description": "Specific meal or all meals. Defaults to all."
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_campus_notices",
                "description": "Fetches recent official notices, circulars, and announcements from the university. Use when asked about notifications, announcements, or recent updates.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": ["academic", "exam", "event", "placement", "hostel", "all"],
                            "description": "Category of notices to fetch. Defaults to all."
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Number of recent notices to return. Defaults to 5."
                        }
                    },
                    "required": []
                }
            }
        },
    ]