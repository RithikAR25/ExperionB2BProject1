import { LightningElement, wire } from 'lwc';

import getBuyerUsers
    from '@salesforce/apex/BuyerUserController.getBuyerUsers';

import createBuyerUserRequest
    from '@salesforce/apex/BuyerUserController.createBuyerUserRequest';

import { refreshApex } from '@salesforce/apex';

import { ShowToastEvent } from 'lightning/platformShowToastEvent';


export default class BuyerUserManagement extends LightningElement {

    // Buyer users displayed in the table
    users = [];

    // Error returned while loading users
    error;

    // Controls Create Buyer User form
    showCreateForm = false;

    // Controls Create button while request is being submitted
    isLoading = false;

    // Stores the wired Apex response for refreshApex()
    wiredUsersResult;


    // Form data
    newUser = {
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
    };


    /*
     * Load contacts/users belonging to the
     * current Buyer Admin's Account.
     */
    @wire(getBuyerUsers)
    wiredUsers(result) {

        this.wiredUsersResult = result;

        const { data, error } = result;

        if (data) {

            this.users = data;

            this.error = undefined;

        } else if (error) {

            this.users = [];

            this.error = error;

            console.error(
                '### ERROR LOADING BUYER USERS:',
                error
            );
        }
    }


    /*
     * Open Create Buyer User form.
     */
    handleCreateUser() {

        console.log(
            '### CREATE BUTTON CLICKED'
        );

        this.showCreateForm = true;
    }


    /*
     * Close form and clear entered values.
     */
    handleCancel() {

        this.showCreateForm = false;

        this.newUser = {
            firstName: '',
            lastName: '',
            email: '',
            phone: ''
        };
    }


    /*
     * Handle First Name, Last Name,
     * Email and Phone changes.
     */
    handleChange(event) {

        const field = event.target.name;

        this.newUser = {
            ...this.newUser,
            [field]: event.target.value
        };
    }


    /*
     * Submit Buyer User creation request.
     *
     * IMPORTANT:
     * This does NOT directly create the Contact/User.
     *
     * It creates Buyer_User_Request__c.
     *
     * The Flow will then create the Contact.
     */
    async handleSaveUser() {

        // Validate all lightning-input fields
        const inputs =
            this.template.querySelectorAll(
                'lightning-input'
            );

        let isValid = true;

        inputs.forEach(input => {

            if (!input.reportValidity()) {
                isValid = false;
            }

        });

        if (!isValid) {
            return;
        }


        this.isLoading = true;


        try {

            console.log(
                '### SUBMITTING BUYER USER REQUEST'
            );

            console.log(
                '### FIRST NAME:',
                this.newUser.firstName
            );

            console.log(
                '### LAST NAME:',
                this.newUser.lastName
            );

            console.log(
                '### EMAIL:',
                this.newUser.email
            );


            /*
             * Create Buyer_User_Request__c
             */
            const requestId =
                await createBuyerUserRequest({

                    firstName:
                        this.newUser.firstName,

                    lastName:
                        this.newUser.lastName,

                    email:
                        this.newUser.email,

                    phone:
                        this.newUser.phone
                });


            console.log(
                '### BUYER USER REQUEST CREATED:',
                requestId
            );


            /*
             * Show success message.
             */
            this.dispatchEvent(
                new ShowToastEvent({

                    title:
                        'Request Submitted',

                    message:
                        'Buyer User creation request submitted successfully.',

                    variant:
                        'success'
                })
            );


            /*
             * Close form and clear fields.
             */
            this.handleCancel();


            /*
             * Refresh the list.
             *
             * Note:
             * The new Contact/User may not appear immediately
             * because the Flow/User creation happens separately.
             */
            await refreshApex(
                this.wiredUsersResult
            );


        } catch (error) {

            console.error(
                '### CREATE BUYER USER REQUEST ERROR:',
                error
            );


            this.dispatchEvent(
                new ShowToastEvent({

                    title:
                        'Error',

                    message:
                        this.getErrorMessage(error),

                    variant:
                        'error'
                })
            );

        } finally {

            this.isLoading = false;
        }
    }


    /*
     * Extract useful error message from
     * Salesforce Apex/LWC error response.
     */
    getErrorMessage(error) {

        if (
            error &&
            error.body &&
            error.body.message
        ) {

            return error.body.message;
        }


        if (
            error &&
            error.body &&
            Array.isArray(error.body)
        ) {

            return error.body
                .map(item => item.message)
                .join(', ');
        }


        if (
            error &&
            error.message
        ) {

            return error.message;
        }


        return 'Unable to submit Buyer User request.';
    }
}