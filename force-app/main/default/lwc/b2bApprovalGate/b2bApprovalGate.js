import { LightningElement, wire } from 'lwc';

import {
    CartSummaryAdapter
} from 'commerce/cartApi';

import getCurrentApproval from
    '@salesforce/apex/ApprovalGateController.getCurrentApproval';

import requestApproval from
    '@salesforce/apex/ApprovalGateController.requestApproval';


export default class B2bApprovalGate extends LightningElement {

    // ================================================================
    // MODIFICATION SECTION:
    // Component state.
    // ================================================================

    cartId;

    approval;

    requestNotes = '';

    isLoading = true;

    isSubmitting = false;

    isRefreshing = false;

    errorMessage;


    // ================================================================
    // MODIFICATION SECTION:
    // Get the current Commerce cart.
    //
    // The buyer does NOT enter the Cart ID.
    // Salesforce Commerce supplies the current cart.
    // ================================================================

    @wire(CartSummaryAdapter)
    wiredCartSummary({ data, error }) {

        if (data) {

            /*
             * Commerce's CartSummaryAdapter provides current-cart
             * summary information.
             *
             * We only need the cart ID for the Apex controller.
             */

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


    // ================================================================
    // MODIFICATION SECTION:
    // Load the approval request associated with the current cart.
    // ================================================================

    async loadApproval() {

        if (!this.cartId) {

            this.errorMessage =
                'The current cart could not be determined.';

            this.isLoading = false;

            return;
        }


        this.errorMessage = undefined;


        try {

            const result =
                await getCurrentApproval({
                    cartId: this.cartId
                });


            this.approval = result;


        } catch (error) {

            this.approval = undefined;

            this.errorMessage =
                this.normalizeError(error);


        } finally {

            this.isLoading = false;

            this.isRefreshing = false;
        }
    }


    // ================================================================
    // MODIFICATION SECTION:
    // Buyer clicks Request Approval.
    //
    // Only the cart ID and optional notes are sent.
    //
    // The Apex controller determines:
    // - Buyer
    // - Amount
    // - Currency
    // - Requester
    // - Status
    // - Request timestamp
    // ================================================================

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


    // ================================================================
    // MODIFICATION SECTION:
    // Refresh approval status.
    // ================================================================

    async handleRefresh() {

        this.isRefreshing = true;

        await this.loadApproval();
    }


    // ================================================================
    // MODIFICATION SECTION:
    // Capture buyer notes.
    // ================================================================

    handleNotesChange(event) {

        this.requestNotes =
            event.target.value;
    }


    // ================================================================
    // MODIFICATION SECTION:
    // Approval state getters.
    // ================================================================

    get status() {

        return this.approval?.status;
    }


    get approvalNumber() {

        return this.approval?.approvalNumber;
    }


    get decisionNotes() {

        return this.approval?.decisionNotes;
    }


    get showRequestForm() {

        return (
            !this.isLoading &&
            !this.hasError &&
            (
                !this.approval ||
                this.status === 'Rejected'
            )
        );
    }


    get showPending() {

        return (
            !this.isLoading &&
            !this.hasError &&
            this.status === 'Pending'
        );
    }


    get showApproved() {

        return (
            !this.isLoading &&
            !this.hasError &&
            this.status === 'Approved'
        );
    }


    get showRejected() {

        return (
            !this.isLoading &&
            !this.hasError &&
            this.status === 'Rejected'
        );
    }


    get hasError() {

        return Boolean(this.errorMessage);
    }


    // ================================================================
    // MODIFICATION SECTION:
    // Convert Salesforce/Apex errors into readable text.
    // ================================================================

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