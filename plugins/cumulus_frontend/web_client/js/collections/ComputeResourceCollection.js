// @todo - make a gruntfile to order these in the proper order?
minerva.models.ComputeResourceModel = girder.Model.extend({
    /**
     * log is what comes back from Girder/Cumulus, abbrev_log
     * is for user facing logs.
     **/
    defaults: {
        'abbrev_log': [],
        'log': []
    },
    resourceName: 'clusters',

    isWorking: function () {
        return _.contains(['creating', 'launching', 'provisioning', 'terminating'],
                          this.get('status'));
    }
});

minerva.collections.ComputeResourceCollection = girder.Collection.extend({
    model: minerva.models.ComputeResourceModel,
    resourceName: 'clusters'
});