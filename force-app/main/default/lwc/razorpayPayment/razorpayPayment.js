import { LightningElement, api, track } from 'lwc';

import {
    loadCheckout,
    postAuthorizePayment
} from 'commerce/checkoutApi';

import createOrder
    from '@salesforce/apex/RazorpayPaymentController.createOrder';

import getKeyId
    from '@salesforce/apex/RazorpayPaymentController.getKeyId';

export default class RazorpayPayment
    extends LightningElement {

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

            this.checkout =
                await loadCheckout();

            this.razorpayKey =
                await getKeyId();

        } catch (error) {

            this.errorMessage =
                this.getErrorMessage(error);
        }
    }

    get buttonLabel() {
        return this.isProcessing
            ? 'Processing...'
            : 'Pay with Razorpay';
    }

    async handlePay() {

        this.errorMessage = '';
        this.isProcessing = true;

        try {

            if (!window.Razorpay) {
                throw new Error(
                    'Razorpay Checkout JavaScript is not loaded.'
                );
            }

            /*
             * MODIFICATION:
             * Always obtain the current checkout state.
             */
            const checkout =
                this.checkout ||
                await loadCheckout();

            /*
             * IMPORTANT:
             * These property paths must be verified against the
             * CheckoutInformation shape exposed by your current
             * Salesforce API version.
             */
            const amount =
                checkout?.cartSummary?.grandTotalAmount ||
                checkout?.grandTotalAmount;

            const currency =
                checkout?.cartSummary?.currencyIsoCode ||
                checkout?.currencyIsoCode ||
                'USD';

            if (!amount) {
                throw new Error(
                    'Unable to determine checkout amount.'
                );
            }

            /*
             * MODIFICATION:
             * Create Razorpay Order on the Salesforce server.
             */
            const razorpayOrder =
                await createOrder({
                    amount,
                    currencyCode: currency
                });

            const options = {

                key:
                    razorpayOrder.keyId,

                amount:
                    razorpayOrder.amount,

                currency:
                    razorpayOrder.currencyCode,

                order_id:
                    razorpayOrder.orderId,

                name:
                    'Aria',

                description:
                    'B2B Commerce Test Payment',

                handler:
                    (response) =>
                        this.handleSuccess(
                            response,
                            razorpayOrder
                        ),

                modal: {
                    ondismiss:
                        () => {
                            this.isProcessing =
                                false;
                        }
                }
            };

            const razorpay =
                new window.Razorpay(
                    options
                );

            razorpay.on(
                'payment.failed',
                (response) => {

                    this.isProcessing =
                        false;

                    this.errorMessage =
                        response?.error?.description ||
                        'Razorpay payment failed.';
                }
            );

            razorpay.open();

        } catch (error) {

            this.isProcessing =
                false;

            this.errorMessage =
                this.getErrorMessage(error);
        }
    }

    async handleSuccess(
        response,
        razorpayOrder
    ) {

        try {

            /*
             * ====================================================
             * MODIFICATION:
             * Send Razorpay result to Salesforce PostAuth.
             *
             * paymentsData is passed to the Payment Gateway Adapter
             * as additionalData.
             * ====================================================
             */
            await postAuthorizePayment(
                this.checkoutId,
                response.razorpay_payment_id,
                undefined,
                {
                    razorpayOrderId:
                        razorpayOrder.orderId,

                    razorpaySignature:
                        response.razorpay_signature
                }
            );

            this.isProcessing =
                false;

            this.dispatchEvent(
                new CustomEvent(
                    'paymentauthorized',
                    {
                        bubbles: true,
                        composed: true
                    }
                )
            );

        } catch (error) {

            this.isProcessing =
                false;

            this.errorMessage =
                this.getErrorMessage(error);
        }
    }

    getErrorMessage(error) {

        if (
            error?.body?.message
        ) {
            return error.body.message;
        }

        if (
            error?.message
        ) {
            return error.message;
        }

        return 'Payment failed. Please try again.';
    }
}