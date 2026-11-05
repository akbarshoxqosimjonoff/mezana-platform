declare module "iyzipay" {
  class Iyzipay {
    static LOCALE: { TR: string; EN: string };
    static CURRENCY: { TRY: string; USD: string; EUR: string };
    static PAYMENT_GROUP: { PRODUCT: string; LISTING: string; SUBSCRIPTION: string };
    static BASKET_ITEM_TYPE: { PHYSICAL: string; VIRTUAL: string };
    constructor(config: { apiKey: string; secretKey: string; uri: string });
    checkoutFormInitialize: {
      create(request: Record<string, any>, cb: (err: any, result: any) => void): void;
    };
    checkoutForm: {
      retrieve(request: { locale?: string; conversationId?: string; token: string }, cb: (err: any, result: any) => void): void;
    };
    payment: {
      retrieve(request: { locale?: string; conversationId?: string; paymentId: string }, cb: (err: any, result: any) => void): void;
    };
  }
  export default Iyzipay;
}
