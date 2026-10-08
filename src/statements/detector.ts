import { StatementParser, ParsedStatementResult } from '../types';
import { KaspiStatementParser } from '../banks/kaspi/kaspiParser';
import { HalykStatementParser } from '../banks/halyk/halykParser';
import { BCCStatementParser } from '../banks/bcc/bccParser';
import { AlatauCityStatementParser } from '../banks/alatau/alatauParser';
import { FreedomStatementParser } from '../banks/freedom/freedomParser';

export class StatementDetector {
  private parsers: StatementParser[];

  constructor() {
    this.parsers = [
      new KaspiStatementParser(),
      new HalykStatementParser(),
      new BCCStatementParser(),
      new AlatauCityStatementParser(),
      new FreedomStatementParser()
    ];
  }

  /**
   * Automatically detect bank from filename, headers, content
   */
  public detectBank(filename: string, content: Uint8Array | string): StatementParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(filename, content)) {
        return parser;
      }
    }
    return null;
  }

  public getParserByCode(bankCode: string): StatementParser | null {
    return this.parsers.find(p => p.bankCode === bankCode) || null;
  }

  public getAllParsers(): StatementParser[] {
    return this.parsers;
  }
}
