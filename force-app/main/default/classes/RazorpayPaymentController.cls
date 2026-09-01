public with sharing class RazorpayPaymentController {

    /*
     * ============================================================
     * MODIFICATION SECTION
     * Razorpay server-side controller.
     *
     * Responsibilities:
     * 1. Create Razorpay Orders.
     * 2. Return the public Key ID.
     * 3. Verify the payment signature.
     * 4. Fetch and validate payment status.
     *
     * NEVER return the Razorpay Key Secret to the browser.
     * ============================================================
     */

    private static final String NAMED_CREDENTIAL =
        'callout:Razorpay_Test_API';

    /*
     * MODIFICATION:
     * Put only the PUBLIC Key ID here.
     *
     * The Key Secret remains inside the Named Credential.
     */
    private static final String TEST_KEY_ID =
        'rzp_test_TWIs9rW4RR3aE2';

    public class CreateOrderResponse {
        @AuraEnabled public String keyId;
        @AuraEnabled public String orderId;
        @AuraEnabled public Long amount;
        @AuraEnabled public String currencyCode;
    }

    @AuraEnabled(cacheable=false)
    public static String getKeyId() {
        return TEST_KEY_ID;
    }

    @AuraEnabled
    public static CreateOrderResponse createOrder(
        Decimal amount,
        String currencyCode
    ) {
        if (amount == null || amount <= 0) {
            throw new AuraHandledException(
                'Payment amount must be greater than zero.'
            );
        }

        if (String.isBlank(currencyCode)) {
            throw new AuraHandledException(
                'Payment currency is required.'
            );
        }

        String normalizedCurrency =
            currencyCode.toUpperCase();

        if (
            normalizedCurrency != 'INR' &&
            normalizedCurrency != 'USD'
        ) {
            throw new AuraHandledException(
                'Only INR and USD are configured for this test integration.'
            );
        }

        Long amountInSmallestUnit =
            (amount * 100)
                .setScale(0)
                .longValue();

        String receipt =
            'SF-' +
            String.valueOf(
                DateTime.now().getTime()
            );

        Map<String, Object> payload =
            new Map<String, Object>{
                'amount' =>
                    amountInSmallestUnit,
                'currency' =>
                    normalizedCurrency,
                'receipt' =>
                    receipt
            };

        HttpRequest request =
            new HttpRequest();

        /*
         * MODIFICATION:
         * Named Credential supplies the authentication.
         */
        request.setEndpoint(
            NAMED_CREDENTIAL +
            '/v1/orders'
        );

        request.setMethod('POST');

        request.setHeader(
            'Content-Type',
            'application/json'
        );

        request.setBody(
            JSON.serialize(payload)
        );

        HttpResponse response;

        try {
            response =
                new Http().send(request);
        } catch (CalloutException ex) {
            throw new AuraHandledException(
                'Razorpay connection failed: ' +
                ex.getMessage()
            );
        }

        if (
            response.getStatusCode() < 200 ||
            response.getStatusCode() >= 300
        ) {
            throw new AuraHandledException(
                'Razorpay order creation failed: ' +
                response.getBody()
            );
        }

        Map<String, Object> result =
            (Map<String, Object>)
            JSON.deserializeUntyped(
                response.getBody()
            );

        CreateOrderResponse output =
            new CreateOrderResponse();

        output.keyId =
            TEST_KEY_ID;

        output.orderId =
            (String) result.get('id');

        output.amount =
            (Long) result.get('amount');

        output.currencyCode =
            (String) result.get('currency');

        return output;
    }

    /*
     * ============================================================
     * MODIFICATION SECTION
     * Signature verification.
     *
     * IMPORTANT:
     * The secret must be obtained securely.
     * Do not hard-code the real secret in Apex.
     * ============================================================
     */
    public static Boolean verifySignature(
        String orderId,
        String paymentId,
        String signature,
        String secret
    ) {
        if (
            String.isBlank(orderId) ||
            String.isBlank(paymentId) ||
            String.isBlank(signature) ||
            String.isBlank(secret)
        ) {
            return false;
        }

        Blob payload =
            Blob.valueOf(
                orderId +
                '|' +
                paymentId
            );

        Blob secretBlob =
            Blob.valueOf(secret);

        Blob digest =
            Crypto.generateMac(
                'HmacSHA256',
                payload,
                secretBlob
            );

        String generatedSignature =
            EncodingUtil.convertToHex(
                digest
            );

        return generatedSignature
            .equalsIgnoreCase(signature);
    }
}
