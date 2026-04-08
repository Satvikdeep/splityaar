/**
 * Debt Simplification & Balance Engine
 * Completely offline and instant calculation.
 * Ported from the original python-service logic.
 */

export function calculateBalances(userId, expenses, settlements) {
  // pairwise_balances[A][B] > 0 means A is owed by B
  const pairwise = {};

  const addDebt = (debtor, creditor, amount) => {
    if (!pairwise[debtor]) pairwise[debtor] = {};
    if (!pairwise[creditor]) pairwise[creditor] = {};
    
    // debtor owes creditor
    pairwise[creditor][debtor] = (pairwise[creditor][debtor] || 0) + amount;
    pairwise[debtor][creditor] = (pairwise[debtor][creditor] || 0) - amount;
  };

  for (const expense of expenses) {
    const totalPaid = expense.payers?.reduce((s, p) => s + parseFloat(p.amount || 0), 0) || 0;
    if (totalPaid < 0.01) continue;

    for (const participant of expense.participants || []) {
      for (const payer of expense.payers || []) {
        if (participant.user_id !== payer.user_id) {
          const amountOwedToPayer = parseFloat(participant.share_amount || 0) * (parseFloat(payer.amount || 0) / totalPaid);
          if (amountOwedToPayer > 0.001) {
             // Participant is debtor, payer is creditor
             addDebt(participant.user_id, payer.user_id, amountOwedToPayer);
          }
        }
      }
    }
  }

  for (const settlement of settlements) {
    // A settlement is essentially: payer pays receiver. So receiver's balance decreases against payer.
    addDebt(settlement.payer_id, settlement.receiver_id, parseFloat(settlement.amount || 0));
  }

  // Format response for the specific user
  const userBalances = pairwise[userId] || {};
  const result = [];
  
  for (const [otherUser, amount] of Object.entries(userBalances)) {
    if (Math.abs(amount) > 0.01) {
      result.push({
        user_id: otherUser,
        amount: Math.round(amount * 100) / 100
      });
    }
  }

  return result;
}
