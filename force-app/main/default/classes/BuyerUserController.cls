public with sharing class BuyerUserController {

    private static Id getCurrentAccountId() {

        User currentUser = [
            SELECT Id, ContactId
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        if (currentUser.ContactId == null) {
            throw new AuraHandledException(
                'Current user is not associated with a Contact.'
            );
        }

        Contact currentContact = [
            SELECT Id, AccountId
            FROM Contact
            WHERE Id = :currentUser.ContactId
            LIMIT 1
        ];

        if (currentContact.AccountId == null) {
            throw new AuraHandledException(
                'Current Contact is not associated with an Account.'
            );
        }

        return currentContact.AccountId;
    }


    @AuraEnabled(cacheable=true)
    public static List<Contact> getBuyerUsers() {

        Id accountId = getCurrentAccountId();

        return [
            SELECT
                Id,
                FirstName,
                LastName,
                Name,
                Email,
                Phone,
                AccountId,
                (
                    SELECT
                        Id,
                        Username,
                        IsActive
                    FROM Users
                )
            FROM Contact
            WHERE AccountId = :accountId
            ORDER BY LastName, FirstName
        ];
    }


    @AuraEnabled
    public static Id createBuyerUserRequest(
        String firstName,
        String lastName,
        String email,
        String phone
    ) {

        if (String.isBlank(firstName)) {
            throw new AuraHandledException(
                'First Name is required.'
            );
        }

        if (String.isBlank(lastName)) {
            throw new AuraHandledException(
                'Last Name is required.'
            );
        }

        if (String.isBlank(email)) {
            throw new AuraHandledException(
                'Email is required.'
            );
        }

        Id accountId = getCurrentAccountId();

        Buyer_User_Request__c request =
            new Buyer_User_Request__c();

        request.First_Name__c = firstName;
        request.Last_Name__c = lastName;
        request.Email__c = email;
        request.Phone__c = phone;
        request.Account__c = accountId;
        request.Status__c = 'Pending';

        insert request;

        return request.Id;
    }
}