import _ from 'underscore';
import bootbox from 'bootbox';
import eventStream from 'girder/utilities/EventStream';
import { restRequest } from 'girder/rest';
import UploadWidget from 'girder/views/widgets/UploadWidget';
import JobStatus from 'girder_plugins/jobs/JobStatus';
import { getCurrentUser } from 'girder/auth';
import { _whenAll } from 'girder/misc';

import events from '../../events';
import Panel from '../body/Panel';
import CsvViewerWidget from '../widgets/CsvViewerWidget';
import DatasetModel from '../../models/DatasetModel';
import DatasetInfoWidget from '../widgets/DatasetInfoWidget';
import PostgresWidget from '../widgets/PostgresWidget';
import template from '../../templates/body/dataPanel.pug';
import '../../stylesheets/body/dataPanel.styl';

export default Panel.extend({
    events: {
        // TODO namespace.
        'click .add-dataset-to-session': 'addDatasetToSessionEvent',
        'click .remove_dataset-from-session': 'removeDatasetFromSession',
        'click .m-upload-local': 'uploadDialog',
        'click .m-postgres': 'connectToPostgres',
        'click .delete-dataset': 'deleteDatasetEvent',
        'click .m-display-dataset-table': 'displayTableDataset',
        'click .dataset-info': 'displayDatasetInfo',
        'click .source-title': 'toggleSources',
        'click .category-title .text': 'toggleCategories',
        'change .category-checkbox.checkbox-container input': 'selectCategory',
        'change .dataset-checkbox.checkbox-container input': 'selectDataset',
        'click .action-bar button.add-to-session': 'addSelectedDatasetsToSession',
        'click .action-bar button.share': 'shareSelectedDatasets',
        'click .action-bar button.delete': 'deleteSelectedDatasets',
        'click .action-bar button.toggle-shared': 'toggleShared',
        'click .action-bar button.show-bounds': 'showBounds',
        'click .action-bar button.remove-bounds': 'removeBounds',
        'click .action-bar button.toggle-bounds-label': 'toggleBoundsLabel'
    },

    toggleCategories: function (event) {
        var categoryTitle = $(event.currentTarget).closest('.category-title');
        var source = categoryTitle.data('source');
        var category = categoryTitle.data('category');
        this.visibleMenus[source][category] = !this.visibleMenus[source][category];
        this.render();
    },

    toggleSources: function (event) {
        var source = $(event.currentTarget).text();
        this.visibleMenus[source] = this.visibleMenus[source] ? null : {};
        this.render();
    },

    connectToPostgres: function (event) {
        var postgresWidget = new PostgresWidget({
            el: $('#g-dialog-container'),
            collection: this.collection,
            parentView: this
        }).on('m:dataset_created', function (datasetId) {
            var dataset = new DatasetModel({ _id: datasetId });
            dataset.on('g:fetched', function () {
                this.collection.add(dataset);
            }, this).fetch();
        });
        postgresWidget.render();
    },

    /**
     * Displays the selected dataset's tabular data in a CSV viewer widget.
     */
    displayTableDataset: function (event) {
        var datasetId = $(event.currentTarget).attr('m-dataset-id');
        var dataset = this.collection.get(datasetId);
        dataset.on('m:dataset_table_dataLoaded', function () {
            new CsvViewerWidget({
                el: $('#g-dialog-container'),
                collection: this.collection,
                parentView: this,
                dataset: dataset,
                data: dataset.get('tableData')
            }).render();
        }, this).loadTabularData();
    },

    /**
     * Displays a dialog allowing the user to upload files, that will become
     * Datasets.
     */
    uploadDialog: function () {
        var container = $('#g-dialog-container');

        this.uploadWidget = new UploadWidget({
            el: container,
            noParent: true,
            title: 'Upload a dataset',
            overrideStart: true,
            parentView: this.parentView,
            multiFile: false
        }).on('g:uploadFinished', function () {
            this.upload = false;
        }, this).render();
        this.listenTo(this.uploadWidget, 'g:uploadStarted', this.uploadStarted);
        this.listenTo(this.uploadWidget, 'g:uploadFinished', this.uploadFinished);
    },

    /**
     * Create a new Item for the dataset, then upload all files there.
     */
    uploadStarted: function () {
        this.newDataset = new DatasetModel({
            name: _.first(this.uploadWidget.files).name,
            folderId: this.collection.folderId
        }).on('g:saved', function () {
            this.uploadWidget.parentType = 'item';
            this.uploadWidget.parent = this.newDataset;
            this.uploadWidget.uploadNextFile();
        }, this).on('g:error', function (err) {
            console.error(err);
        });
        this.newDataset.save();
    },

    /**
     * Promote an Item to a Dataset, then add it to the DatasetCollection.
     */
    uploadFinished: function () {
        var params = {};
        // If the file is csv, parse the first 10 rows and save in minerva metadata
        if (this.uploadWidget.files &&
            this.uploadWidget.files.length > 0 &&
            this.uploadWidget.files[0].type === 'text/csv') {
            var ROWS_PREVIEW = 10;
            if (typeof (FileReader) !== 'undefined') {
                var reader = new FileReader();
                reader.onload = function (e) {
                    // get file content
                    var csv = e.target.result;
                    var parsedCSV = Papa.parse(csv, { skipEmptyLines: true, header: true, preview: ROWS_PREVIEW });
                    if (parsedCSV.data) {
                        params.csvPreview = parsedCSV.data;
                    }
                };
                reader.readAsText(this.uploadWidget.files[0]);
            } else {
                alert('This browser does not support HTML5.');
            }
        }
        this.newDataset.on('m:dataset_promoted', function () {
            this.collection.add(this.newDataset);
        }, this).on('g:error', function (err) {
            console.error(err);
        }).promoteToDataset(params);
    },

    addDatasetToSessionEvent: function (event) {
        var datasetId = $(event.currentTarget).attr('m-dataset-id'),
            dataset = this.collection.get(datasetId);

        dataset.set('displayed', true);
    },

    addSelectedDatasetsToSession() {
        Array.from(this.selectedDatasetsId)
            .map((datasetId) => this.collection.get(datasetId))
            .filter((dataset) => {
                return !dataset.get('displayed');
            })
            .forEach((dataset) => {
                dataset.set('displayed', true);
            });
        this.clearSelection();
        this.render();
    },

    removeDatasetFromSession: function (event) {
        var datasetId = $(event.currentTarget).attr('m-dataset-id'),
            dataset = this.collection.get(datasetId);
        dataset.removeFromSession();
    },

    deleteDatasetEvent: function (event) {
        if ($(event.currentTarget).hasClass('icon-disabled')) {
            return;
        }
        bootbox.confirm('Do you want to delete this dataset?', (result) => {
            if (!result) {
                return;
            }
            var datasetId = $(event.currentTarget).attr('m-dataset-id');
            var dataset = this.collection.get(datasetId);
            this.selectedDatasetsId.delete(datasetId);
            dataset.destroy();
            this.collection.remove(dataset);
        });
    },

    clearSelection() {
        this.selectedDatasetsId.clear();
    },

    deletableSelectedDatasets() {
        return Array.from(this.selectedDatasetsId)
            .map((datasetId) => this.collection.get(datasetId))
            .filter((dataset) => {
                return dataset.get('creatorId') === this.currentUser.id &&
                    !dataset.get('displayed');
            });
    },

    deleteSelectedDatasets() {
        bootbox.confirm('Do you want to delete these selected datasets?', (result) => {
            if (result) {
                this.deletableSelectedDatasets()
                    .forEach((dataset) => {
                        this.selectedDatasetsId.delete(dataset.get('_id'));
                        dataset.destroy();
                        this.collection.remove(dataset);
                    });
                this.clearSelection();
            }
        });
    },

    sharableSelectedDatasets() {
        return Array.from(this.selectedDatasetsId)
            .map((datasetId) => this.collection.get(datasetId))
            .filter((dataset) => {
                return dataset.get('creatorId') === this.currentUser.id;
            });
    },

    shareSelectedDatasets() {
        var sharableDatasets = this.sharableSelectedDatasets();
        var toShareDatasets = sharableDatasets.filter((dataset) => dataset.get('folderId') === this.collection.folderId);
        var toUnshareDatasets = sharableDatasets.filter((dataset) => dataset.get('folderId') !== this.collection.folderId);
        var update = (dataset, updatedDataset) => {
            dataset.set('folderId', updatedDataset.folderId);
        };
        return Promise.all(
            toShareDatasets.map((dataset) => {
                return restRequest({
                    type: 'PUT',
                    url: `minerva_dataset/share/${dataset.id}`
                })
                    .done((updatedDataset) => update(dataset, updatedDataset));
            })
                .concat(toUnshareDatasets.map((dataset) => {
                    return restRequest({
                        type: 'PUT',
                        url: `minerva_dataset/unshare/${dataset.id}`
                    })
                        .done((updatedDataset) => update(dataset, updatedDataset));
                }))
        ).then(() => {
            this.clearSelection();
            this.render();
            return undefined;
        });
    },

    displayDatasetInfo: function (event) {
        var datasetId = $(event.currentTarget).attr('m-dataset-id');
        var dataset = this.collection.get(datasetId);
        this.datasetInfoWidget = new DatasetInfoWidget({
            el: $('#g-dialog-container'),
            dataset: dataset,
            parentView: this
        });
        this.datasetInfoWidget.render();
    },
    initialize: function (settings) {
        this.allChecked = this.allChecked.bind(this);
        this.deletableSelectedDatasets = this.deletableSelectedDatasets.bind(this);
        this.sharableSelectedDatasets = this.sharableSelectedDatasets.bind(this);
        var externalId = 1;
        this.collection = settings.session.datasetCollection;
        this.sessionModel = settings.session.model;
        this.currentUser = getCurrentUser();
        this.visibleMenus = {};
        this.showSharedDatasets = !!this.sessionModel.getValue('showSharedDatasets');
        this.selectedDatasetsId = new Set();
        this.listenTo(this.collection, 'g:changed', function () {
            this.render();
        }, this).listenTo(this.collection, 'change', function () {
            this.render();
        }, this).listenTo(this.collection, 'change:meta', function () {
            this.render();
        }, this).listenTo(this.collection, 'change:displayed', function () {
            this.render();
        }, this).listenTo(this.collection, 'add', function () {
            this.render();
        }, this).listenTo(this.collection, 'remove', function () {
            this.render();
        }, this).listenTo(this.collection, 'zoom-to', function (dataset) {
            this._getDatasetBounds(dataset)
                .done((result) => {
                    events.trigger('m:zoom-to', result);
                });
        }, this).listenTo(events, 'm:updateDatasets', function () {
            this.collection.fetch(undefined, true);
        }, this).listenTo(events, 'm:addExternalGeoJSON', function (options) {
            if (!options || !options.data) {
                console.warn('Invalid external geojson');
                return;
            }
            var dataset = new DatasetModel({
                _id: externalId++,
                name: options.name || 'External GeoJSON',
                folderId: options.folderId || this.collection.folderId,
                creatorId: this.currentUser.id
            });
            dataset.set({
                meta: {
                    minerva: {
                        dataset_type: 'geojson',
                        original_type: 'geojson',
                        geo_render: {
                            type: 'geojson'
                        },
                        geojson: {
                            data: options.data
                        },
                        source: {
                            layer_source: 'GeoJSON',
                            source_type: 'geojson'
                        }
                    }
                }
            });

            // these datasets are temporary, so these are noops
            dataset.sync = function () { };
            dataset.fetch = function () { };
            dataset.save = function () { };
            dataset.destroy = function () { };

            dataset.saveMinervaMetadata = function (mm) {
                if (mm) {
                    dataset.setMinervaMetadata(mm);
                }
                return dataset;
            };

            this.collection.add(dataset);
        }, this);

        eventStream.on('g:event.job_status', _.bind(function (event) {
            var status = window.parseInt(event.data.status);
            if (status === JobStatus.SUCCESS) {
                if (event.data && event.data.meta && event.data.meta.minerva &&
                    event.data.meta.minerva.outputs && event.data.meta.minerva.outputs.length > 0 &&
                    event.data.meta.minerva.outputs[0].dataset_id) {
                    var datasetId = event.data.meta.minerva.outputs[0].dataset_id;
                    var dataset = new DatasetModel({ _id: datasetId });
                    dataset.on('g:fetched', function () {
                        this.collection.add(dataset);
                    }, this).fetch();
                }
            }
        }, this));

        Panel.prototype.initialize.apply(this);
    },

    getDatasetModel: function () {
        return this.parentView.parentView.model;
    },

    selectDataset(e) {
        var datasetId = $(e.target).attr('m-dataset-id');
        if (e.target.checked) {
            this.selectedDatasetsId.add(datasetId);
        } else {
            this.selectedDatasetsId.delete(datasetId);
        }
        this.render();
    },

    selectCategory(event) {
        var categoryTitle = $(event.target).closest('.category-title');
        var datasetIds = categoryTitle.next('.m-datasets').find('.dataset')
            .map((i, el) => $(el).attr('m-dataset-id'))
            .toArray();
        if (this.allChecked(datasetIds)) {
            datasetIds.forEach((datasetId) => this.selectedDatasetsId.delete(datasetId));
        } else {
            datasetIds.forEach((datasetId) => this.selectedDatasetsId.add(datasetId));
        }
        var source = categoryTitle.data('source');
        var category = categoryTitle.data('category');
        this.visibleMenus[source][category] = true;
        this.render();
    },

    allChecked(datasetIds) {
        return _.every(datasetIds, (datasetId) => {
            return this.selectedDatasetsId.has(datasetId);
        });
    },

    toggleShared() {
        this.showSharedDatasets = !this.showSharedDatasets;
        this.render();
        this.sessionModel.setValue('showSharedDatasets', this.showSharedDatasets);
    },

    _getDatasetBounds(dataset) {
        var minervaMetadata = dataset.metadata();
        var bounds = minervaMetadata.bounds || dataset.bounds;
        if (bounds) {
            return $.Deferred().resolve({ dataset, bounds });
        }
        return restRequest({
            type: 'GET',
            url: `minerva_dataset/${dataset.get('_id')}/bound`
        }).then((bounds) => {
            dataset.bounds = bounds;
            return { dataset, bounds };
        });
    },

    showBounds() {
        _whenAll(
            this.collection.filter((dataset) => this.selectedDatasetsId.has(dataset.get('_id'))).map((dataset) => this._getDatasetBounds(dataset))
        ).then((results) => {
            events.trigger('m:request-show-bounds', results);
            this.showingBounds = true;
            this.clearSelection();
            this.render();
            return undefined;
        });
    },

    removeBounds() {
        events.trigger('m:request-remove-bounds');
        this.showingBounds = false;
        this.render();
    },

    toggleBoundsLabel() {
        events.trigger('m:toggle-bounds-label');
    },

    render() {
        var sourceName = (model) => {
            return (((model.get('meta') || {}).minerva || {}).source || {}).layer_source;
        };

        this.sourceCategoryDataset = _.chain(this.collection.models)
            .filter(sourceName)
            .filter((dataset) => {
                if (this.showSharedDatasets) {
                    return true;
                } else {
                    return dataset.get('creatorId') === this.currentUser.id;
                }
            })
            .groupBy(sourceName)
            .mapObject((datasets, key) => {
                return _.groupBy(datasets, (dataset) => {
                    return dataset.get('meta').minerva.category || 'Other';
                });
            }).value();

        this.$el.html(template(this));

        // TODO pagination and search?
        return this;
    }

});
