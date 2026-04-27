from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from src.evaluator import evaluate_message


async def test_evaluate_message_returns_insightful():
    mock_result = MagicMock()
    mock_result.content = '{"thinking_quality": "insightful", "feedback": "Great connection to market dynamics."}'
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_result)

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("What drove their growth strategy?", [])

    assert result["thinking_quality"] == "insightful"
    assert result["feedback"] == "Great connection to market dynamics."


async def test_evaluate_message_returns_shallow():
    mock_result = MagicMock()
    mock_result.content = '{"thinking_quality": "shallow", "feedback": "Try to go deeper than describing what happened."}'
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_result)

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("What is this case about?", [])

    assert result["thinking_quality"] == "shallow"
    assert result["feedback"] == "Try to go deeper than describing what happened."


async def test_evaluate_message_passes_chat_history():
    history = [HumanMessage(content="First question"), AIMessage(content="First answer")]
    captured = {}

    async def capture_invoke(inputs):
        captured["inputs"] = inputs
        return MagicMock(content='{"thinking_quality": "developing", "feedback": "Keep exploring."}')

    mock_chain = MagicMock()
    mock_chain.ainvoke = capture_invoke

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("Follow-up question", history)

    assert captured["inputs"]["chat_history"] == history
    assert captured["inputs"]["input"] == "Follow-up question"
    assert result["thinking_quality"] == "developing"
    assert result["feedback"] == "Keep exploring."


async def test_evaluate_message_falls_back_on_invalid_json():
    mock_result = MagicMock()
    mock_result.content = "not valid json"
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_result)

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("Some question", [])

    assert result["thinking_quality"] == "developing"
    assert result["feedback"] == ""
