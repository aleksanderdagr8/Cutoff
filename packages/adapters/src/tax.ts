/**
 * Tax adapter boundary. Start with quote-included tax; Avalara later if needed.
 */

export type TaxInput = {
  amountCents: number;
  addressId: string;
};

export type TaxResult = {
  taxCents: number;
};

export interface TaxAdapter {
  estimate(input: TaxInput): Promise<TaxResult>;
}

/** Fake used in CI / Unit 0. Returns zero tax. */
export class FakeTaxAdapter implements TaxAdapter {
  async estimate(input: TaxInput): Promise<TaxResult> {
    void input;
    return { taxCents: 0 };
  }
}
