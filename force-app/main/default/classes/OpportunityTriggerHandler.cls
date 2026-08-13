public class OpportunityTriggerHandler {

    public static void createTask(
        List<Opportunity> newList,
        Map<Id,Opportunity> oldMap
    ){

        List<Task> taskList = new List<Task>();

        for(Opportunity opp : newList){

            Opportunity oldOpp = oldMap.get(opp.Id);

            if(
                oldOpp.StageName != 'Closed Won'
                &&
                opp.StageName == 'Closed Won'
            ){

                Task t = new Task();

                t.Subject = 'Follow up with Customer';

                t.Status = 'Not Started';

                t.Priority = 'Normal';

                t.WhatId = opp.Id;

                taskList.add(t);

            }

        }

        if(!taskList.isEmpty()){

            insert taskList;

        }

    }

}