import { NormalizedTransaction } from '../types';

/**
 * Deduplication & Hash Generation Service
 * Calculates resilient composite external_hash:
 * external_hash = sha256(bank_transaction_id || bank + account + date + amount + currency + description)
 */
export class Deduplicator {
  /**
   * Generates a stable composite hash for a transaction.
   * If bank provides a unique transaction ID / reference, use it primarily.
   */
  public static async computeHash(tx: NormalizedTransaction): Promise<string> {
    const cleanDate = tx.operationDate.slice(0, 10); // YYYY-MM-DD
    const roundedAmount = Math.round(tx.amount * 100) / 100;
    const cleanDesc = (tx.description || '').trim().toLowerCase().replace(/\s+/g, ' ');

    let rawString = '';
    if (tx.bankTransactionId && tx.bankTransactionId.length > 3) {
      rawString = `${tx.bankCode}:${tx.bankTransactionId}:${roundedAmount}:${tx.currency}`;
    } else {
      rawString = `${tx.bankCode}:${tx.accountNumber || 'default'}:${cleanDate}:${roundedAmount}:${tx.currency}:${cleanDesc}`;
    }

    // In Cloudflare Workers and modern Node, crypto.subtle is available
    const encoder = new TextEncoder();
    const data = encoder.encode(rawString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Filter duplicates against an existing set of hashes
   */
  public static async filterDuplicates(
    incoming: NormalizedTransaction[],
    existingHashes: Set<string>
  ): Promise<{ unique: NormalizedTransaction[]; duplicatesCount: number }> {
    const unique: NormalizedTransaction[] = [];
    let duplicatesCount = 0;
    const seenInBatch = new Set<string>();

    for (const tx of incoming) {
      const hash = tx.externalHash || (await this.computeHash(tx));
      tx.externalHash = hash;

      if (existingHashes.has(hash) || seenInBatch.has(hash)) {
        duplicatesCount++;
      } else {
        seenInBatch.add(hash);
        unique.push(tx);
      }
    }

    return { unique, duplicatesCount };
  }
}
