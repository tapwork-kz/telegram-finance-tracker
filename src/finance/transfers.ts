import { NormalizedTransaction } from '../types';

export interface InternalTransferPair {
  expenseTx: NormalizedTransaction;
  incomeTx: NormalizedTransaction;
  confidence: number;
}

/**
 * TransferDetector
 * Identifies transfers between own accounts (e.g. Kaspi -> Halyk).
 * Matches:
 *  - Expense on Bank A with Income on Bank B
 *  - Same or nearly identical amount (+/- 1 KZT or commission)
 *  - Same currency
 *  - Dates within 48 hours
 *  - Descriptions mentioning "перевод", "transfer", "с карты", "на карту", "пополнение"
 */
export class TransferDetector {
  public static linkTransfers(transactions: NormalizedTransaction[]): {
    linkedPairs: InternalTransferPair[];
    totalTransferAmount: number;
  } {
    const expenses = transactions.filter(t => t.direction === 'expense' && !t.isInternalTransfer);
    const incomes = transactions.filter(t => t.direction === 'income' && !t.isInternalTransfer);

    const linkedPairs: InternalTransferPair[] = [];
    const usedIncomeIdx = new Set<number>();
    let totalTransferAmount = 0;

    for (const exp of expenses) {
      const expTime = new Date(exp.operationDate).getTime();
      const expAmt = exp.amount;

      // Look for a matching income
      for (let j = 0; j < incomes.length; j++) {
        if (usedIncomeIdx.has(j)) continue;
        const inc = incomes[j];

        // Must be different banks or different accounts
        if (exp.bankCode === inc.bankCode && exp.accountNumber === inc.accountNumber) {
          continue;
        }

        // Must be same currency
        if (exp.currency !== inc.currency) continue;

        // Amount match (within 0.01 precision)
        if (Math.abs(expAmt - inc.amount) > 0.01) continue;

        // Date proximity: within 48 hours (172800000 ms)
        const incTime = new Date(inc.operationDate).getTime();
        const diffMs = Math.abs(expTime - incTime);
        if (diffMs > 48 * 3600 * 1000) continue;

        // Check transfer keywords in description
        const expDesc = (exp.description || '').toLowerCase();
        const incDesc = (inc.description || '').toLowerCase();
        const transferKeywords = ['перевод', 'transfer', 'между счетами', 'пополнение карты', 'списание на карту', 'p2p'];

        const hasKeyword = transferKeywords.some(k => expDesc.includes(k) || incDesc.includes(k));

        // Mark as internal transfer
        (exp as any).isInternalTransfer = true;
        (inc as any).isInternalTransfer = true;

        usedIncomeIdx.add(j);
        linkedPairs.push({
          expenseTx: exp,
          incomeTx: inc,
          confidence: hasKeyword ? 0.95 : 0.8
        });
        totalTransferAmount += expAmt;
        break;
      }
    }

    return { linkedPairs, totalTransferAmount };
  }
}
