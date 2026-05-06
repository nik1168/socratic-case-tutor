"""
Seed the database with realistic demo data for the analytics dashboard.
Run: cd backend && uv run python seed.py
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

import asyncpg
from dotenv import load_dotenv

load_dotenv()

NOW = datetime.now(timezone.utc)

# (session_id, file_id, file_name, created_days_ago, last_active_days_ago)
SESSIONS = [
    ("demo-student-1", "file-airbnb-001", "Airbnb IPO Case.pdf", 6, 3),
    ("demo-student-1", "file-netflix-001", "Netflix Strategy 2025.pdf", 4, 2),
    ("demo-student-2", "file-airbnb-001", "Airbnb IPO Case.pdf", 2, 0),
]

# (session_id, file_id, role, content, response_type, thinking_quality, feedback, days_ago)
MESSAGES = [
    # — Student 1 / Airbnb (days 6 → 4) —
    ("demo-student-1", "file-airbnb-001", "user",
     "Why would Airbnb go public via IPO rather than SPAC?",
     None, None, None, 6),
    ("demo-student-1", "file-airbnb-001", "assistant",
     "Interesting. What do you think the main advantage of a traditional IPO is vs a SPAC?",
     "socratic_response", "shallow",
     "You are identifying the right question but haven't explored the trade-offs yet.", 6),
    ("demo-student-1", "file-airbnb-001", "user",
     "An IPO gives more visibility and credibility to investors.",
     None, None, None, 5),
    ("demo-student-1", "file-airbnb-001", "assistant",
     "How might investor credibility translate to Airbnb's valuation given the COVID recovery timing?",
     "socratic_response", "developing",
     "Good connection between credibility and valuation — link it to the market conditions.", 5),
    ("demo-student-1", "file-airbnb-001", "user",
     "Institutional investors trust IPOs more, so they'd price the stock higher. COVID made SPACs riskier due to uncertain demand.",
     None, None, None, 4),
    ("demo-student-1", "file-airbnb-001", "assistant",
     "Excellent synthesis. You've connected market timing, investor psychology, and risk appetite.",
     "socratic_response", "insightful",
     "Strong multi-factor analysis linking market environment to strategic decision.", 4),

    # — Student 1 / Netflix (days 4 → 2) —
    ("demo-student-1", "file-netflix-001", "user",
     "What is Netflix's main competitive advantage?",
     None, None, None, 4),
    ("demo-student-1", "file-netflix-001", "assistant",
     "What factors do you think define a competitive advantage in the streaming industry?",
     "clarification", "shallow",
     "The question is too broad — anchor it to a specific aspect of Netflix's business.", 4),
    ("demo-student-1", "file-netflix-001", "user",
     "I think it's their content library and recommendation algorithm.",
     None, None, None, 3),
    ("demo-student-1", "file-netflix-001", "assistant",
     "How do those two factors reinforce each other, and what would it cost a competitor to replicate both?",
     "socratic_response", "developing",
     "You identified two dimensions — now explore the interaction and the barrier to replication.", 3),
    ("demo-student-1", "file-netflix-001", "user",
     "The algorithm improves with more viewers, making content investment pay off — a data flywheel hard to copy quickly.",
     None, None, None, 2),
    ("demo-student-1", "file-netflix-001", "assistant",
     "Sharp observation on the flywheel. Under what conditions could this advantage erode?",
     "socratic_response", "insightful",
     "Excellent identification of the reinforcing loop. The flywheel framing is exactly right.", 2),

    # — Student 2 / Airbnb (days 2 → 0) —
    ("demo-student-2", "file-airbnb-001", "user",
     "How did COVID affect Airbnb's IPO decision?",
     None, None, None, 2),
    ("demo-student-2", "file-airbnb-001", "assistant",
     "Which aspect interests you most — financial, strategic, or timing?",
     "clarification", "shallow",
     "Try to narrow the scope before analyzing.", 2),
    ("demo-student-2", "file-airbnb-001", "user",
     "The timing — why 2020 specifically despite the pandemic?",
     None, None, None, 1),
    ("demo-student-2", "file-airbnb-001", "assistant",
     "What does Airbnb's 2020 revenue trajectory tell you about why that timing was counterintuitive but strategically smart?",
     "socratic_response", "developing",
     "Good focus. Dig into the counterintuitive argument.", 1),
    ("demo-student-2", "file-airbnb-001", "user",
     "Revenue dropped 30% but they cut costs and turned cash-flow positive. Investors saw the rebound — IPO captured that optimism.",
     None, None, None, 0),
    ("demo-student-2", "file-airbnb-001", "assistant",
     "Exactly. You identified the asymmetry: short-term pain vs. demonstrated resilience and future optionality.",
     "socratic_response", "insightful",
     "Precise analysis connecting financial discipline to market timing. Well done.", 0),
]


async def seed() -> None:
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    try:
        for session_id, file_id, file_name, created_ago, last_active_ago in SESSIONS:
            await pool.execute(
                """
                INSERT INTO sessions (session_id, file_id, file_name, created_at, last_active_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (session_id, file_id) DO UPDATE
                  SET file_name      = EXCLUDED.file_name,
                      last_active_at = EXCLUDED.last_active_at
                """,
                session_id, file_id, file_name,
                NOW - timedelta(days=created_ago),
                NOW - timedelta(days=last_active_ago),
            )

        for session_id, file_id, role, content, response_type, thinking_quality, feedback, days_ago in MESSAGES:
            ts = NOW - timedelta(days=days_ago, minutes=30)
            await pool.execute(
                """
                INSERT INTO messages
                  (session_id, file_id, role, content, response_type, thinking_quality, feedback, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                session_id, file_id, role, content,
                response_type, thinking_quality, feedback, ts,
            )

        print(f"Seeded {len(SESSIONS)} sessions and {len(MESSAGES)} messages.")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(seed())
