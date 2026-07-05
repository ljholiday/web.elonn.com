/*
 * Reconciles selected runtime state across replacement World Datasets.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime.ContinuityReconciler = {
        reconcile: function (previous, next) {
            var indexes = next.indexes || {};
            var selectedObjectId = String(previous && previous.selectedObjectId || '');
            var selectedCollectionId = String(previous && previous.selectedCollectionId || '');

            if (selectedObjectId !== '' && indexes.objects && indexes.objects[selectedObjectId]) {
                next.selectedObjectId = selectedObjectId;
            }
            if (selectedCollectionId !== '' && indexes.collections && indexes.collections[selectedCollectionId]) {
                next.selectedCollectionId = selectedCollectionId;
            }
            if (previous && previous.actionResult) {
                next.actionResult = previous.actionResult;
            }

            return next;
        }
    };
}());
