import { LightningElement, wire } from 'lwc';

// ================================================================
// MODIFICATION:
// Register the LWC with Salesforce Commerce Checkout so the
// component can participate in checkout validation.
// ================================================================
import {
    useCheckoutComponent
} from 'commerce/checkoutApi';

import {
    CartSummaryAdapter
} from 'commerce/cartApi';

import getCurrentApproval from
    '@salesforce/apex/ApprovalGateController.getCurrentApproval';

import requestApproval from
    '@salesforce/apex/ApprovalGateController.requestApproval';

// ================================================================
// MODIFICATION:
// Use the existing server-side validation method from
// ApprovalGateController before allowing checkout to continue.
// ================================================================
import validateApprovalForCheckout from
    '@salesforce/apex/ApprovalGateController.validateApprovalForCheckout';


// ================================================================
// MODIFICATION:
// Salesforce Commerce Checkout lifecycle stages.
// ================================================================
const CheckoutStage = {

    CHECK_VALIDITY_UPDATE:
        'CHECK_VALIDITY_UPDATE',

    REPORT_VALIDITY_SAVE:
        'REPORT_VALIDITY_SAVE',

    BEFORE_PAYMENT:
        'BEFORE_PAYMENT',

    PAYMENT:
        'PAYMENT',

    BEFORE_PLACE_ORDER:
        'BEFORE_PLACE_ORDER',

    PLACE_ORDER:
        'PLACE_ORDER'
};


// ================================================================
// MODIFICATION:
// Extend useCheckoutComponent so Salesforce Commerce can invoke
// checkValidity(), reportValidity(), and stageAction().
// ================================================================
export default class B2bApprovalGate
    extends useCheckoutComponent(LightningElement) {


    // ============================================================
    // COMPONENT STATE
    // ============================================================

    cartId;

    approval;

    requestNotes = '';

    isLoading = true;

    isSubmitting = false;

    isRefreshing = false;

    errorMessage;


    // ============================================================
    // CURRENT CART
    // ============================================================

    @wire(CartSummaryAdapter)
    wiredCartSummary({ data, error }) {

        if (data) {

            this.cartId = data.cartId;

            if (this.cartId) {

                this.loadApproval();

            } else {

                this.errorMessage =
                    'The current cart could not be determined.';

                this.isLoading = false;
            }

        } else if (error) {

            this.errorMessage =
                this.normalizeError(error);

            this.isLoading = false;
        }
    }


    // ============================================================
    // LOAD CURRENT APPROVAL
    // ============================================================

    async loadApproval() {

        if (!this.cartId) {

            this.errorMessage =
                'The current cart could not be determined.';

            this.isLoading = false;
            this.isRefreshing = false;

            return;
        }

        this.errorMessage = undefined;

        try {

            const result =
                await getCurrentApproval({
                    cartId: this.cartId
                });

            this.approval = result;

            // ====================================================
            // FIX:
            // If the page loads and Salesforce already reports the
            // approval as Approved, clear any stale Commerce
            // Checkout validation error.
            // ====================================================

            if (
                result?.status === 'Approved' &&
                result?.approvalRequestId
            ) {

                this.errorMessage = undefined;

                await this.dispatchUpdateErrorAsync({
                    groupId: 'B2BApprovalGate'
                });
            }

        } catch (error) {

            this.approval = undefined;

            this.errorMessage =
                this.normalizeError(error);

        } finally {

            this.isLoading = false;

            this.isRefreshing = false;
        }
    }


    // ============================================================
    // REQUEST APPROVAL
    // ============================================================

    async handleRequestApproval() {

        if (!this.cartId) {

            this.errorMessage =
                'The current cart could not be determined.';

            return;
        }

        this.isSubmitting = true;

        this.errorMessage = undefined;

        try {

            const result =
                await requestApproval({

                    cartId: this.cartId,

                    requestNotes: this.requestNotes
                });

            this.approval = result;

            this.requestNotes = '';

        } catch (error) {

            this.errorMessage =
                this.normalizeError(error);

        } finally {

            this.isSubmitting = false;
        }
    }


    // ============================================================
    // REFRESH APPROVAL STATUS
    // ============================================================

    async handleRefresh() {

        if (!this.cartId) {

            this.errorMessage =
                'The current cart could not be determined.';

            return;
        }

        this.isRefreshing = true;

        // ========================================================
        // FIX:
        // Clear the local error before retrieving the latest
        // approval status.
        // ========================================================

        this.errorMessage = undefined;

        try {

            const result =
                await getCurrentApproval({

                    cartId: this.cartId
                });

            // ====================================================
            // MODIFICATION:
            // Replace the current approval state with the latest
            // state returned from Salesforce.
            // ====================================================

            this.approval = result;


            // ====================================================
            // FIX:
            // IMPORTANT:
            //
            // When the administrator approves the request in CRM,
            // Refresh Status gets the new Approved record.
            //
            // Explicitly clear the old Commerce Checkout error
            // here. Otherwise the old Pending validation message
            // can remain visible even though the approval is now
            // Approved.
            // ====================================================

            if (
                result?.status === 'Approved' &&
                result?.approvalRequestId
            ) {

                this.errorMessage = undefined;

                await this.dispatchUpdateErrorAsync({
                    groupId: 'B2BApprovalGate'
                });
            }


        } catch (error) {

            this.errorMessage =
                this.normalizeError(error);

        } finally {

            this.isRefreshing = false;
        }
    }


    // ============================================================
    // NOTES
    // ============================================================

    handleNotesChange(event) {

        this.requestNotes =
            event.target.value;
    }


    // ============================================================
    // APPROVAL GETTERS
    // ============================================================

    get status() {

        return this.approval?.status;
    }


    // ============================================================
    // MODIFICATION:
    // Approval Request ID used by server-side checkout validation.
    // ============================================================

    get approvalRequestId() {

        return this.approval?.approvalRequestId;
    }


    get approvalNumber() {

        return this.approval?.approvalNumber;
    }


    get decisionNotes() {

        return this.approval?.decisionNotes;
    }


    // ============================================================
    // DISPLAY STATE
    // ============================================================

    get showRequestForm() {

        return (
            !this.isLoading &&
            !this.approval
        );
    }


    get showPending() {

        return (
            !this.isLoading &&
            this.status === 'Pending'
        );
    }


    get showApproved() {

        return (
            !this.isLoading &&
            this.status === 'Approved'
        );
    }


    get showRejected() {

        return (
            !this.isLoading &&
            this.status === 'Rejected'
        );
    }


    get hasError() {

        return Boolean(this.errorMessage);
    }


    // ============================================================
    // MODIFICATION:
    // Local Commerce checkout validation.
    //
    // Only an Approved approval request is valid.
    //
    // Pending  -> false
    // Rejected -> false
    // Approved -> true
    // ============================================================

    checkValidity() {

        return (
            !this.isLoading &&
            this.status === 'Approved' &&
            Boolean(this.approvalRequestId)
        );
    }


    // ============================================================
    // MODIFICATION:
    // Report validation result to Salesforce Commerce Checkout.
    // ============================================================

    reportValidity() {

        const valid =
            this.checkValidity();


        if (!valid) {

            const message =
                'Approval is required before you can continue to payment.';

            this.errorMessage =
                message;

            this.dispatchUpdateErrorAsync({

                groupId:
                    'B2BApprovalGate',

                type:
                    '/commerce/errors/checkout-failure',

                exception:
                    message
            });

            return false;
        }


        // ========================================================
        // MODIFICATION:
        // Clear the previous checkout validation error when
        // approval is now valid.
        // ========================================================

        this.errorMessage =
            undefined;

        this.dispatchUpdateErrorAsync({

            groupId:
                'B2BApprovalGate'
        });

        return true;
    }


    // ============================================================
    // MODIFICATION:
    // Authoritative server-side approval validation.
    //
    // ApprovalGateController.validateApprovalForCheckout()
    // verifies the approval against the current cart.
    // ============================================================

    async validateApprovalOnServer() {

        if (!this.cartId) {

            this.errorMessage =
                'The current cart could not be determined.';

            return false;
        }


        if (!this.approvalRequestId) {

            this.errorMessage =
                'An approval request is required before continuing.';

            return false;
        }


        try {

            const isValid =
                await validateApprovalForCheckout({

                    cartId:
                        this.cartId,

                    approvalRequestId:
                        this.approvalRequestId
                });


            if (!isValid) {

                const message =
                    'Approval is required before you can continue to payment.';

                this.errorMessage =
                    message;

                await this.dispatchUpdateErrorAsync({

                    groupId:
                        'B2BApprovalGate',

                    type:
                        '/commerce/errors/checkout-failure',

                    exception:
                        message
                });

                return false;
            }


            // ====================================================
            // MODIFICATION:
            // Clear any previous checkout validation error when
            // server-side approval validation succeeds.
            // ====================================================

            this.errorMessage =
                undefined;

            await this.dispatchUpdateErrorAsync({

                groupId:
                    'B2BApprovalGate'
            });

            return true;


        } catch (error) {

            this.errorMessage =
                this.normalizeError(error);

            await this.dispatchUpdateErrorAsync({

                groupId:
                    'B2BApprovalGate',

                type:
                    '/commerce/errors/checkout-failure',

                exception:
                    this.errorMessage
            });

            return false;
        }
    }


    // ============================================================
    // MODIFICATION:
    // Salesforce Commerce Checkout lifecycle.
    //
    // CHECK_VALIDITY_UPDATE:
    //     Performs local validation.
    //
    // REPORT_VALIDITY_SAVE:
    //     Performs local validation and then authoritative
    //     server-side Apex validation.
    //
    // Returning false prevents checkout progression.
    // ============================================================

    async stageAction(checkoutStage) {

        switch (checkoutStage) {


            case CheckoutStage.CHECK_VALIDITY_UPDATE:

                return this.checkValidity();


            case CheckoutStage.REPORT_VALIDITY_SAVE:

                if (!this.checkValidity()) {

                    return this.reportValidity();
                }

                return await this.validateApprovalOnServer();


            default:

                return true;
        }
    }


    // ============================================================
    // ERROR NORMALIZATION
    // ============================================================

    normalizeError(error) {

        if (!error) {

            return 'An unexpected error occurred.';
        }


        if (
            error.body &&
            typeof error.body.message === 'string'
        ) {

            return error.body.message;
        }


        if (
            Array.isArray(error.body)
        ) {

            return error.body
                .map(item => item.message)
                .join(', ');
        }


        if (
            typeof error.message === 'string'
        ) {

            return error.message;
        }


        return 'An unexpected error occurred.';
    }
}