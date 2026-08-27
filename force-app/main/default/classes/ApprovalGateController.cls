/**
 * B2B Commerce Buyer Approval Gate
 *
 * Responsibilities:
 * 1. Read the current buyer's approval request for the current cart.
 * 2. Create an approval request using authoritative WebCart data.
 * 3. Submit the approval request to the Salesforce Approval Process.
 * 4. Return approval information to the storefront.
 * 5. Perform the final server-side approval validation.
 */
public with sharing class ApprovalGateController {

    /**
     * Get the current buyer's approval request for the current cart.
     */
    // ================================================================
// MODIFICATION:
// Do not cache the current approval status.
//
// The administrator can approve/reject the request from Salesforce
// CRM while the buyer's checkout page is still open. Therefore,
// Refresh Status must retrieve the current value from Salesforce.
// ================================================================
    @AuraEnabled
    public static Map<String, Object> getCurrentApproval(Id cartId) {

        validateCartId(cartId);

        WebCart cart = getAuthorizedCart(cartId);

        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE ORDER BY and LIMIT.
         * ============================================================
         */
        List<Approval_Request__c> requests = [
            SELECT
                Id,
                Name,
                Status__c,
                Requested_Amount__c,
                Currency_Iso_Code__c,
                Cart_Id__c,
                Requested_At__c,
                Decision_At__c,
                Decision_Notes__c,
                Requester__c
            FROM Approval_Request__c
            WHERE Cart_Id__c = :String.valueOf(cart.Id)
              AND Requester__c = :UserInfo.getUserId()
            WITH SYSTEM_MODE
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        if (requests.isEmpty()) {
            return null;
        }

        return toState(requests[0]);
    }


    /**
     * Create and submit a new Approval Request.
     */
    @AuraEnabled
    public static Map<String, Object> requestApproval(
        Id cartId,
        String requestNotes
    ) {

        validateCartId(cartId);

        WebCart cart = getAuthorizedCart(cartId);


        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE ORDER BY and LIMIT.
         * ============================================================
         */
        List<Approval_Request__c> pendingRequests = [
            SELECT
                Id,
                Name,
                Status__c,
                Requested_Amount__c,
                Currency_Iso_Code__c,
                Cart_Id__c,
                Requested_At__c,
                Decision_At__c,
                Decision_Notes__c,
                Requester__c
            FROM Approval_Request__c
            WHERE Cart_Id__c = :String.valueOf(cart.Id)
              AND Requester__c = :UserInfo.getUserId()
              AND Status__c = 'Pending'
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        if (!pendingRequests.isEmpty()) {
            return toState(pendingRequests[0]);
        }


        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE ORDER BY and LIMIT.
         * ============================================================
         */
        List<Approval_Request__c> approvedRequests = [
            SELECT
                Id,
                Name,
                Status__c,
                Requested_Amount__c,
                Currency_Iso_Code__c,
                Cart_Id__c,
                Requested_At__c,
                Decision_At__c,
                Decision_Notes__c,
                Requester__c
            FROM Approval_Request__c
            WHERE Cart_Id__c = :String.valueOf(cart.Id)
              AND Requester__c = :UserInfo.getUserId()
              AND Status__c = 'Approved'
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        if (!approvedRequests.isEmpty()) {

            Approval_Request__c approvedRequest =
                approvedRequests[0];

            if (
                approvedRequest.Requested_Amount__c != null &&
                cart.GrandTotalAmount != null &&
                approvedRequest.Requested_Amount__c ==
                    cart.GrandTotalAmount
            ) {
                return toState(approvedRequest);
            }
        }


        /*
         * ============================================================
         * MODIFICATION:
         * Create the Approval Request using server-authoritative
         * Commerce cart data.
         * ============================================================
         */
        Approval_Request__c request =
            new Approval_Request__c();

        request.Cart_Id__c =
            String.valueOf(cart.Id);

        request.Buyer_Account_Id__c =
            String.valueOf(cart.AccountId);

        request.Buyer_Account__c =
            cart.AccountId;

        request.Requester__c =
            UserInfo.getUserId();

        request.Web_Store_Id__c =
            String.valueOf(cart.WebStoreId);

        request.Requested_Amount__c =
            cart.GrandTotalAmount;

        request.CurrencyIsoCode =
            cart.CurrencyIsoCode;

        request.Cart_Last_Modified__c =
            cart.LastModifiedDate;

        request.Requested_At__c =
            System.now();

        request.Status__c =
            'Pending';

        request.Request_Notes__c =
            sanitizeNotes(requestNotes);


        // ================================================================
        // MODIFICATION SECTION:
        // Return the actual DML error during development.
        // ================================================================

        Database.SaveResult insertResult =
    Database.insert(
        request,
        AccessLevel.USER_MODE
    );

if (!insertResult.isSuccess()) {

    List<String> errors = new List<String>();

    for (Database.Error error : insertResult.getErrors()) {

        errors.add(
            String.valueOf(error.getStatusCode()) +
            ': ' +
            error.getMessage()
        );
    }

    throw new AuraHandledException(
        'Approval Request insert failed: ' +
        String.join(errors, ' | ')
    );
}


        /*
         * ============================================================
         * Submit the record to your active Salesforce Approval Process.
         * ============================================================
         */
        Approval.ProcessSubmitRequest submitRequest =
            new Approval.ProcessSubmitRequest();

        submitRequest.setObjectId(request.Id);

        submitRequest.setComments(
            String.isBlank(request.Request_Notes__c)
                ? 'Buyer requested checkout approval.'
                : request.Request_Notes__c
        );

        // ================================================================
// MODIFICATION SECTION:
// Capture the actual Salesforce Approval Process result.
// ================================================================

Approval.ProcessResult result =
    Approval.process(submitRequest);

if (!result.isSuccess()) {

    List<String> errors = new List<String>();

    for (Database.Error error : result.getErrors()) {

        errors.add(
            String.valueOf(error.getStatusCode()) +
            ': ' +
            error.getMessage()
        );
    }

    throw new AuraHandledException(
        'Approval submission failed: ' +
        String.join(errors, ' | ')
    );
}


        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE LIMIT.
         * ============================================================
         */
        Approval_Request__c refreshedRequest = [
            SELECT
                Id,
                Name,
                Status__c,
                Requested_Amount__c,
                Currency_Iso_Code__c,
                Cart_Id__c,
                Requested_At__c,
                Decision_At__c,
                Decision_Notes__c,
                Requester__c
            FROM Approval_Request__c
            WHERE Id = :request.Id
              AND Requester__c = :UserInfo.getUserId()
            WITH USER_MODE
            LIMIT 1
        ];

        return toState(refreshedRequest);
    }


    /**
     * Get a specific Approval Request.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getApproval(
        Id approvalRequestId
    ) {

        if (approvalRequestId == null) {
            throw new AuraHandledException(
                'Approval Request ID is required.'
            );
        }


        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE LIMIT.
         * ============================================================
         */
        List<Approval_Request__c> requests = [
            SELECT
                Id,
                Name,
                Status__c,
                Requested_Amount__c,
                Currency_Iso_Code__c,
                Cart_Id__c,
                Requested_At__c,
                Decision_At__c,
                Decision_Notes__c,
                Requester__c
            FROM Approval_Request__c
            WHERE Id = :approvalRequestId
              AND Requester__c = :UserInfo.getUserId()
            WITH USER_MODE
            LIMIT 1
        ];

        if (requests.isEmpty()) {
            return null;
        }

        return toState(requests[0]);
    }


    /**
     * Final server-side validation before order placement.
     *
     * IMPORTANT:
     * The LWC status is never trusted as the final authority.
     */
    @AuraEnabled
    public static Boolean validateApprovalForCheckout(
        Id cartId,
        Id approvalRequestId
    ) {

        validateCartId(cartId);

        if (approvalRequestId == null) {
            return false;
        }

        WebCart cart =
            getAuthorizedCart(cartId);


        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE LIMIT.
         * ============================================================
         */
        List<Approval_Request__c> requests = [
            SELECT
                Id,
                Status__c,
                Requested_Amount__c,
                Cart_Id__c,
                Cart_Last_Modified__c,
                Requester__c
            FROM Approval_Request__c
            WHERE Id = :approvalRequestId
              AND Requester__c = :UserInfo.getUserId()
            WITH USER_MODE
            LIMIT 1
        ];

        if (requests.isEmpty()) {
            return false;
        }

        Approval_Request__c request =
            requests[0];


        /*
         * ============================================================
         * MODIFICATION:
         * Final approval checks.
         * ============================================================
         */

        // 1. Approval must be Approved.
        if (request.Status__c != 'Approved') {
            return false;
        }


        // 2. Approval must belong to the current cart.
        if (
            request.Cart_Id__c !=
            String.valueOf(cart.Id)
        ) {
            return false;
        }


        // 3. Approved amount must equal the current cart total.
        if (
            request.Requested_Amount__c == null ||
            cart.GrandTotalAmount == null ||
            request.Requested_Amount__c !=
            cart.GrandTotalAmount
        ) {
            return false;
        }


        // ================================================================
// FIX:
// Detect only a cart modification that happened AFTER approval.
//
// Do NOT require the two LastModifiedDate values to be exactly
// equal. The cart can legitimately have a later LastModifiedDate
// while still representing the cart that was approved.
//
// If the current cart was modified after the approval snapshot,
// reject checkout.
// ================================================================
if (
    request.Cart_Last_Modified__c != null &&
    cart.LastModifiedDate >
    request.Cart_Last_Modified__c
) {
    return false;
}

        return true;
    }


    /**
     * Get the current WebCart.
     */
    private static WebCart getAuthorizedCart(
        Id cartId
    ) {

        /*
         * ============================================================
         * MODIFICATION:
         * WITH USER_MODE is placed BEFORE LIMIT.
         * ============================================================
         */
        List<WebCart> carts = [
            SELECT
                Id,
                AccountId,
                WebStoreId,
                Status,
                GrandTotalAmount,
                CurrencyIsoCode,
                LastModifiedDate
            FROM WebCart
            WHERE Id = :cartId
            WITH SYSTEM_MODE
            LIMIT 1
        ];

        if (carts.isEmpty()) {

            throw new AuraHandledException(
                'You do not have access to this cart.'
            );
        }

        WebCart cart = carts[0];


        if (
            cart.Status == 'Closed' ||
            cart.Status == 'Deleted'
        ) {

            throw new AuraHandledException(
                'This cart is no longer available for approval.'
            );
        }

        return cart;
    }


    /**
     * Validate cart ID.
     */
    private static void validateCartId(
        Id cartId
    ) {

        if (cartId == null) {

            throw new AuraHandledException(
                'Cart ID is required.'
            );
        }
    }


    /**
     * Clean buyer-entered notes.
     */
    private static String sanitizeNotes(
        String notes
    ) {

        if (String.isBlank(notes)) {
            return null;
        }

        String trimmed =
            notes.trim();

        if (trimmed.length() > 32000) {
            trimmed =
                trimmed.substring(0, 32000);
        }

        return trimmed;
    }


    /**
     * Convert Approval Request into an LWC-compatible Map.
     */
    private static Map<String, Object> toState(
        Approval_Request__c request
    ) {

        if (request == null) {
            return null;
        }

        Map<String, Object> state =
            new Map<String, Object>();

        state.put(
            'approvalRequestId',
            request.Id
        );

        state.put(
            'approvalNumber',
            request.Name
        );

        state.put(
            'status',
            request.Status__c
        );

        state.put(
            'requestedAmount',
            request.Requested_Amount__c
        );

        state.put(
            'currencyIsoCode',
            request.Currency_Iso_Code__c
        );

        state.put(
            'cartId',
            request.Cart_Id__c
        );

        state.put(
            'requestedAt',
            request.Requested_At__c
        );

        state.put(
            'decisionAt',
            request.Decision_At__c
        );

        state.put(
            'decisionNotes',
            request.Decision_Notes__c
        );

        return state;
    }
}