import os

import anthropic

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are an AI tutor helping students analyze business case studies.
Your role is to help students think critically about the cases they are reading.
Guide students toward insights through thoughtful questions and observations.
Be concise and focused."""


def ask_claude(pdf_text: str, question: str) -> str:
    message = _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Case study content:\n\n{pdf_text}\n\n---\n\nStudent question: {question}",
            }
        ],
    )
    return message.content[0].text
