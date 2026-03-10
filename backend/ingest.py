import os
from PyPDF2 import PdfReader
from openai import OpenAI
from pinecone import Pinecone
from dotenv import load_dotenv

# Load your .env file
load_dotenv()

# 1. Setup the AI Client (Using your GitHub Bypass)
client = OpenAI(
    base_url="https://models.inference.ai.azure.com",
    api_key=os.getenv("GITHUB_TOKEN"),
)

# 2. Setup Pinecone Client
# Make sure you add PINECONE_API_KEY to your .env file!
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Replace this with whatever you named your index in the Pinecone dashboard
index_name = "campus-copilot" 
index = pc.Index(index_name)

# --- YOUR RAG FUNCTIONS ---

def extract_pdf_text(file_path):
    text = ""
    reader = PdfReader(file_path)
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

def chunk_text(giant_text, chunk_size=1000):
    chunks = []
    for i in range(0, len(giant_text), chunk_size):
        chunk = giant_text[i : i + chunk_size]
        chunks.append(chunk)
    return chunks

def get_embedding(text_chunk):
    response = client.embeddings.create(
        input=text_chunk,
        model="text-embedding-3-small"
    )
    vector = response.data[0].embedding
    return vector

# --- THE MASTER LOOP ---

def upload_pdf_to_pinecone(file_path):
    print(f"📖 Step 1: Reading {file_path}...")
    raw_text = extract_pdf_text(file_path)

    print("✂️ Step 2: Chopping text into chunks...")
    chunks = chunk_text(raw_text, chunk_size=1000)
    print(f"   -> Created {len(chunks)} chunks.")

    print("🧠 Step 3: Translating chunks into math & Uploading...")
    
    # We will store our packaged data here before sending it to Pinecone
    vectors_to_upload = []
    
    for i, chunk in enumerate(chunks):
        # 1. Get the math
        vector_math = get_embedding(chunk)
        
        # 2. Create a unique ID
        chunk_id = f"mit_rulebook_chunk_{i}"
        
        # 3. Package it together (ID, Math, Sticky Note)
        packaged_data = (
            chunk_id, 
            vector_math, 
            {"text": chunk} # <--- THIS IS CRITICAL! The AI reads this later.
        )
        
        vectors_to_upload.append(packaged_data)

    # 4. Fire it all up to the database!
    index.upsert(vectors=vectors_to_upload)
    
    print("✅ SUCCESS! Campus Copilot now has a memory.")

# --- RUN THE SCRIPT ---
if __name__ == "__main__":
    # Make sure you put a sample PDF in your backend/data folder!
    upload_pdf_to_pinecone("data/Course structure_CS Stream-2025 (1).pdf")