global with sharing class RazorpayPaymentGatewayAdapter
    implements commercepayments.PaymentGatewayAdapter {

    /*
     * ============================================================
     * MODIFICATION SECTION
     * Salesforce Commerce PaymentGatewayAdapter.
     *
     * The adapter implements PostAuth.
     * ============================================================
     */

    global RazorpayPaymentGatewayAdapter() {
    }

    global commercepayments.GatewayResponse processRequest(
        commercepayments.PaymentGatewayContext gatewayContext
    ) {

        commercepayments.RequestType requestType =
            gatewayContext.getPaymentRequestType();

        if (
            requestType ==
            commercepayments.RequestType.PostAuth
        ) {
            return processPostAuth(
                gatewayContext
            );
        }

        return new commercepayments.GatewayErrorResponse(
            '400',
            'Unsupported Razorpay request type: ' +
            String.valueOf(requestType)
        );
    }

    private commercepayments.GatewayResponse processPostAuth(
        commercepayments.PaymentGatewayContext gatewayContext
    ) {

        commercepayments.PostAuthorizationRequest request =
            (commercepayments.PostAuthorizationRequest)
            gatewayContext.getPaymentRequest();

        commercepayments.PostAuthApiPaymentMethodRequest
            paymentMethod =
            request.paymentMethod;

        commercepayments.AlternativePaymentMethodRequest
            alternativePaymentMethod =
            paymentMethod.alternativePaymentMethod;

        if (
            alternativePaymentMethod == null
        ) {
            return new commercepayments.GatewayErrorResponse(
                '400',
                'Razorpay payment token is missing.'
            );
        }

        String paymentId =
            alternativePaymentMethod.gatewayToken;

        if (
            String.isBlank(paymentId)
        ) {
            return new commercepayments.GatewayErrorResponse(
                '400',
                'Razorpay payment ID is missing.'
            );
        }

        /*
         * MODIFICATION:
         * The custom Checkout component sends additional
         * verification data through paymentsData.
         *
         * Salesforce transfers this into additionalData
         * for the adapter.
         */
        String razorpayOrderId;

        if (
            request.additionalData != null
        ) {
            razorpayOrderId =
                request.additionalData.get(
                    'razorpayOrderId'
                );
        }

        if (
            String.isBlank(razorpayOrderId)
        ) {
            return new commercepayments.GatewayErrorResponse(
                '400',
                'Razorpay Order ID is missing.'
            );
        }

        /*
         * ========================================================
         * MODIFICATION:
         * Query Razorpay directly from the Payment Adapter.
         *
         * PaymentsHttp uses the Named Credential associated
         * with the Payment Gateway.
         * ========================================================
         */
        HttpRequest httpRequest =
            new HttpRequest();

        httpRequest.setEndpoint(
            '/v1/payments/' +
            EncodingUtil.urlEncode(
                paymentId,
                'UTF-8'
            )
        );

        httpRequest.setMethod('GET');

        commercepayments.PaymentsHttp paymentsHttp =
            new commercepayments.PaymentsHttp();

        HttpResponse razorpayResponse;

        try {
            razorpayResponse =
                paymentsHttp.send(
                    httpRequest
                );
        } catch (Exception ex) {
            return new commercepayments.GatewayErrorResponse(
                '500',
                'Razorpay verification failed: ' +
                ex.getMessage()
            );
        }

        if (
            razorpayResponse.getStatusCode() < 200 ||
            razorpayResponse.getStatusCode() >= 300
        ) {
            return new commercepayments.GatewayErrorResponse(
                String.valueOf(
                    razorpayResponse.getStatusCode()
                ),
                'Razorpay payment lookup failed.'
            );
        }

        Map<String, Object> payment =
            (Map<String, Object>)
            JSON.deserializeUntyped(
                razorpayResponse.getBody()
            );

        String gatewayOrderId =
            (String) payment.get(
                'order_id'
            );

        String status =
            (String) payment.get(
                'status'
            );

        String currencyCode =
            (String) payment.get(
                'currency'
            );

        Decimal gatewayAmount =
            Decimal.valueOf(
                String.valueOf(
                    payment.get('amount')
                )
            ) / 100;

        /*
         * MODIFICATION:
         * Order ID validation.
         */
        if (
            gatewayOrderId !=
            razorpayOrderId
        ) {
            return decline(
                'Razorpay order ID mismatch.'
            );
        }

        /*
         * MODIFICATION:
         * Amount validation.
         */
        if (
            request.amount == null ||
            gatewayAmount != request.amount
        ) {
            return decline(
                'Razorpay amount does not match the checkout amount.'
            );
        }

        /*
         * MODIFICATION:
         * Currency validation.
         */
        if (
            !String.isBlank(
                request.currencyIsoCode
            ) &&
            currencyCode !=
                request.currencyIsoCode
        ) {
            return decline(
                'Razorpay currency does not match the checkout currency.'
            );
        }

        /*
         * MODIFICATION:
         * Only authorized/captured payments can pass.
         */
        if (
            status != 'captured' &&
            status != 'authorized'
        ) {
            return decline(
                'Razorpay payment status is ' +
                status
            );
        }

        commercepayments.PostAuthorizationResponse response =
            new commercepayments.PostAuthorizationResponse();

        response.setAmount(
            request.amount
        );

        response.setGatewayReferenceNumber(
            paymentId
        );

        response.setGatewayResultCode(
            status
        );

        response.setGatewayResultCodeDescription(
            'Razorpay Test Mode payment verified.'
        );

        response.setGatewayDate(
            System.now()
        );

        response.setSalesforceResultCodeInfo(
            new commercepayments.SalesforceResultCodeInfo(
                commercepayments.SalesforceResultCode.Success
            )
        );

        return response;
    }

    private commercepayments.GatewayResponse decline(
        String message
    ) {

        commercepayments.PostAuthorizationResponse response =
            new commercepayments.PostAuthorizationResponse();

        response.setGatewayResultCode(
            'DECLINED'
        );

        response.setGatewayResultCodeDescription(
            message
        );

        response.setSalesforceResultCodeInfo(
            new commercepayments.SalesforceResultCodeInfo(
                commercepayments.SalesforceResultCode.Decline
            )
        );

        return response;
    }
}