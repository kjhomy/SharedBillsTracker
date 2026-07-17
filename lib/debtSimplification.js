// Greedy debt simplification: given each member's net position (positive
// = owed money, negative = owes money), produces the minimum number of
// pairwise transactions that settle everyone up. Trivial at 2 people (one
// line), but written generally since the household is meant to extend
// past 2 without this needing a rewrite.
//
// Pure function, no DB/RLS concerns of its own — just array math over
// numbers already fetched via net_balances().
export function simplifyDebts(netBalances) {
  const EPSILON = 0.005; // half a penny — ignore drift below this

  const creditors = netBalances
    .filter((b) => b.net_amount > EPSILON)
    .map((b) => ({ member_id: b.member_id, amount: b.net_amount }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = netBalances
    .filter((b) => b.net_amount < -EPSILON)
    .map((b) => ({ member_id: b.member_id, amount: -b.net_amount }))
    .sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const amount = Math.round(Math.min(creditor.amount, debtor.amount) * 100) / 100;

    if (amount > 0) {
      transactions.push({
        from_member_id: debtor.member_id,
        to_member_id: creditor.member_id,
        amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount <= EPSILON) i++;
    if (debtor.amount <= EPSILON) j++;
  }

  return transactions;
}
