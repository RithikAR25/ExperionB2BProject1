import { LightningElement, api, track } from 'lwc';

import {
    useCheckoutComponent,
    CheckoutStage,
    loadCheckout,
    postAuthorizePayment
} from 'commerce/checkoutApi';

import createOrder
    from '@salesforce/apex/RazorpayPaymentController.createOrder';

import getKeyId
    from '@salesforce/apex/RazorpayPaymentController.getKeyId';

export default class RazorpayPayment extends useCheckoutComponent(LightningElement) {

    /*
     * ============================================================
     * MODIFICATION SECTION
     * Razorpay custom Commerce payment component.
     * ============================================================
     */

    @api checkoutId;

    @track errorMessage = '';

    isProcessing = false;

    checkout;

    razorpayKey;

    async connectedCallback() {
        await this.initialize();
    }

    async initialize() {
        try {
            this.checkout = await loadCheckout();
            this.razorpayKey = await getKeyId();
        } catch (error) {
            this.errorMessage = this.getErrorMessage(error);
        }
    }

    /**
     * Integrates with the official Salesforce Checkout Framework.
     * The framework calls this when the user clicks 'Place Order'.
     */
    async stageAction(checkoutStage) {
        if (checkoutStage === CheckoutStage.PAYMENT) {
            return await this.handlePaymentProcess();
        }
        return true;
    }

    async handlePaymentProcess() {
        return new Promise(async (resolve) => {
            this.errorMessage = '';
            this.isProcessing = true;

            try {
                if (!window.Razorpay) {
                    throw new Error('Razorpay Checkout JavaScript is not loaded.');
                }

                const checkout = this.checkout || await loadCheckout();
                const amount = checkout?.cartSummary?.grandTotalAmount || checkout?.grandTotalAmount;
                const currency = checkout?.cartSummary?.currencyIsoCode || checkout?.currencyIsoCode || 'USD';

                if (!amount) {
                    throw new Error('Unable to determine checkout amount.');
                }

                /*
                 * MODIFICATION:
                 * Create Razorpay Order on the Salesforce server.
                 */
                const razorpayOrder = await createOrder({
                    amount,
                    currencyCode: currency
                });

                const options = {
                    key: razorpayOrder.keyId,
                    amount: razorpayOrder.amount,
                    currency: razorpayOrder.currencyCode,
                    order_id: razorpayOrder.orderId,
                    name: 'Aria',
                    description: 'B2B Commerce Test Payment',
                    handler: async (response) => {
                        try {
                            /*
                             * MODIFICATION:
                             * Send Razorpay result to Salesforce PostAuth.
                             */
                            await postAuthorizePayment(
                                this.checkoutId,
                                response.razorpay_payment_id,
                                undefined,
                                {
                                    razorpayOrderId: razorpayOrder.orderId,
                                    razorpaySignature: response.razorpay_signature
                                }
                            );

                            this.isProcessing = false;
                            resolve(true); // Tell the framework payment was successful, proceed to PLACE_ORDER

                        } catch (error) {
                            this.isProcessing = false;
                            this.errorMessage = this.getErrorMessage(error);
                            this.dispatchUpdateErrorAsync({ message: this.errorMessage });
                            resolve(false); // Stop checkout
                        }
                    },
                    modal: {
                        ondismiss: () => {
                            this.isProcessing = false;
                            this.errorMessage = 'Payment cancelled by user.';
                            this.dispatchUpdateErrorAsync({ message: this.errorMessage });
                            resolve(false); // Stop checkout
                        }
                    }
                };

                const razorpay = new window.Razorpay(options);

                razorpay.on('payment.failed', (response) => {
                    this.isProcessing = false;
                    this.errorMessage = response?.error?.description || 'Razorpay payment failed.';
                    this.dispatchUpdateErrorAsync({ message: this.errorMessage });
                    resolve(false); // Stop checkout
                });

                razorpay.open();

            } catch (error) {
                this.isProcessing = false;
                this.errorMessage = this.getErrorMessage(error);
                this.dispatchUpdateErrorAsync({ message: this.errorMessage });
                resolve(false);
            }
        });
    }

    getErrorMessage(error) {
        if (error?.body?.message) {
            return error.body.message;
        }
        if (error?.message) {
            return error.message;
        }
        return 'Payment failed. Please try again.';
    }
}