# backend/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI

# Load the .env file
env_path = find_dotenv()
load_dotenv(env_path)

github_token = os.getenv("GITHUB_TOKEN")
if not github_token:
    raise ValueError("❌ CRITICAL ERROR: Could not find GITHUB_TOKEN in your .env file.")

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

class ChatRequest(BaseModel):
    message: str
    user_id: str

system_prompt = """
You are Campus Copilot, an AI assistant for university students at Manipal Institute of Technology.
You are helpful, concise, and professional. 
If a student asks to book a lab or check attendance, confidently tell them you can handle it.
"""

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    print(f"User {req.user_id} says: {req.message}")
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o", # You get the full GPT-4o model for free here
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.message}
            ],
            temperature=0.7,
            max_tokens=400
        )
        
        ai_reply = response.choices[0].message.content
        
        # Simulate action card for demo
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