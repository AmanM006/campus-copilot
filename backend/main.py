# backend/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI
from pinecone import Pinecone # <-- NEW RAG IMPORT

# Load the .env file
env_path = find_dotenv()
load_dotenv(env_path)

github_token = os.getenv("GITHUB_TOKEN")
if not github_token:
    raise ValueError("❌ CRITICAL ERROR: Could not find GITHUB_TOKEN in your .env file.")

pinecone_key = os.getenv("PINECONE_API_KEY")
if not pinecone_key:
    raise ValueError("❌ CRITICAL ERROR: Could not find PINECONE_API_KEY in your .env file.")

app = FastAPI()

# Allow Next.js to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔥 THE BYPASS: Connect to Azure's models via GitHub's free developer endpoint 🔥
client = OpenAI(
    base_url="https://models.inference.ai.azure.com",
    api_key=github_token,
)

# 🔥 NEW: Connect to your Pinecone Vector Database 🔥
pc = Pinecone(api_key=pinecone_key)
index = pc.Index("campus-copilot")

class ChatRequest(BaseModel):
    message: str
    user_id: str

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    print(f"User {req.user_id} says: {req.message}")
    
    try:
        # --- RAG STEP 1: Turn the user's question into math ---
        embedding_response = client.embeddings.create(
            input=req.message,
            model="text-embedding-3-small"
        )
        question_vector = embedding_response.data[0].embedding

        # --- RAG STEP 2: Search Pinecone for the closest matching PDF chunks ---
        search_results = index.query(
            vector=question_vector,
            top_k=3, # Grab the top 3 best matches
            include_metadata=True # Bring back the English text "sticky notes"
        )

        # --- RAG STEP 3: Stitch the retrieved text together ---
        retrieved_context = ""
        for match in search_results['matches']:
            if 'text' in match['metadata']:
                retrieved_context += match['metadata']['text'] + "\n\n"

        # --- RAG STEP 4: Build the dynamic System Prompt ---
        # We inject the retrieved_context right into the instructions!
        dynamic_system_prompt = f"""
        You are Campus Copilot, an AI assistant for university students at Manipal Institute of Technology.
        You are helpful, concise, and professional. 
        If a student asks to book a lab or check attendance, confidently tell them you can handle it.
        
        IMPORTANT RULES:
        1. Answer the user's question using the CAMPUS CONTEXT provided below.
        2. If the context doesn't contain the exact answer, answer as best as you can but mention you are not referencing the official manual.
        
        CAMPUS CONTEXT:
        {retrieved_context}
        """

        # --- RAG STEP 5: Ask GPT-4o ---
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": dynamic_system_prompt},
                {"role": "user", "content": req.message}
            ],
            temperature=0.7,
            max_tokens=400
        )
        
        ai_reply = response.choices[0].message.content
        
        # Simulate action card for demo (Kept exactly as you wrote it!)
        action_data = None
        if "lab" in req.message.lower() or "robotics" in req.message.lower():
            action_data = {
                "type": "Resource Booking",
                "status": "Verified & Booked via Campus API",
                "details": "Robotics Lab • Tomorrow"
            }
            
        return {
            "reply": ai_reply,
            "action": action_data
        }
        
    except Exception as e:
        print(f"API Error: {e}")
        return {
            "reply": "I hit a snag connecting to the neural net. Please try again.",
            "action": None
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)