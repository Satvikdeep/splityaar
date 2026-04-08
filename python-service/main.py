from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict
import heapq

app = FastAPI(title="SplitYaar Balance Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Participant(BaseModel):
    user_id: str
    share_amount: float


class Payer(BaseModel):
    user_id: str
    amount: float

class Expense(BaseModel):
    id: str
    amount: float
    payers: list[Payer]
    participants: list[Participant]


class Settlement(BaseModel):
    id: str
    payer_id: str
    receiver_id: str
    amount: float


class BalanceRequest(BaseModel):
    user_id: str
    expenses: list[Expense]
    settlements: list[Settlement]


class DebtEdge(BaseModel):
    from_user: str
    to_user: str
    amount: float


class SimplifyRequest(BaseModel):
    debts: list[DebtEdge]


def compute_net_balances(expenses: list[Expense], settlements: list[Settlement]) -> dict[str, dict[str, float]]:
    """
    Compute net balances between all pairs of users.
    Returns a dict: { user_id: { other_user_id: amount } }
    Positive amount means user_id is owed money by other_user_id.
    Negative means user_id owes money to other_user_id.
    """
    # pairwise_balances[A][B] > 0 means A is owed by B
    pairwise = defaultdict(lambda: defaultdict(float))

    for expense in expenses:
        total_paid = sum(p.amount for p in expense.payers)
        if total_paid < 0.01:
            continue
            
        for participant in expense.participants:
            for payer in expense.payers:
                if participant.user_id != payer.user_id:
                    # The fraction of the participant's debt owed to THIS payer
                    amount_owed_to_payer = participant.share_amount * (payer.amount / total_paid)
                    pairwise[payer.user_id][participant.user_id] += amount_owed_to_payer
                    pairwise[participant.user_id][payer.user_id] -= amount_owed_to_payer

    for settlement in settlements:
        # payer paid receiver, so reduce what payer owes receiver
        pairwise[settlement.payer_id][settlement.receiver_id] += settlement.amount
        pairwise[settlement.receiver_id][settlement.payer_id] -= settlement.amount

    return {k: dict(v) for k, v in pairwise.items()}


def simplify_debts(debts: list[DebtEdge]) -> list[dict]:
    """
    Simplify debts to minimize number of transactions.
    Uses a greedy algorithm: compute net balance for each user,
    then match largest creditor with largest debtor.
    """
    # Compute net balance for each user
    net = defaultdict(float)
    for debt in debts:
        net[debt.from_user] -= debt.amount
        net[debt.to_user] += debt.amount

    # Separate into creditors (positive) and debtors (negative)
    creditors = []  # max-heap (negate for max behavior)
    debtors = []    # max-heap (negate for max behavior)

    for user, balance in net.items():
        if balance > 0.01:
            heapq.heappush(creditors, (-balance, user))
        elif balance < -0.01:
            heapq.heappush(debtors, (balance, user))  # already negative

    simplified = []

    while creditors and debtors:
        credit_amount, creditor = heapq.heappop(creditors)
        debt_amount, debtor = heapq.heappop(debtors)

        credit_amount = -credit_amount  # restore positive
        debt_amount = -debt_amount      # restore positive

        settle_amount = min(credit_amount, debt_amount)
        settle_amount = round(settle_amount, 2)

        if settle_amount > 0.01:
            simplified.append({
                "from_user": debtor,
                "to_user": creditor,
                "amount": settle_amount,
            })

        remaining_credit = round(credit_amount - settle_amount, 2)
        remaining_debt = round(debt_amount - settle_amount, 2)

        if remaining_credit > 0.01:
            heapq.heappush(creditors, (-remaining_credit, creditor))
        if remaining_debt > 0.01:
            heapq.heappush(debtors, (-remaining_debt, debtor))

    return simplified


@app.post("/calculate-balances")
async def calculate_balances(request: BalanceRequest):
    """Calculate net balances for a user against all other users."""
    all_balances = compute_net_balances(request.expenses, request.settlements)
    user_balances = all_balances.get(request.user_id, {})

    # Format response: list of { user_id, amount } where positive = they owe you
    result = []
    for other_user, amount in user_balances.items():
        if abs(amount) > 0.01:
            result.append({
                "user_id": other_user,
                "amount": round(amount, 2),
            })

    return {"balances": result}


@app.post("/simplify-debts")
async def simplify_debts_endpoint(request: SimplifyRequest):
    """Simplify a set of debts to minimize transactions."""
    simplified = simplify_debts(request.debts)
    return {"simplified_debts": simplified}


@app.get("/health")
async def health():
    return {"status": "ok"}
