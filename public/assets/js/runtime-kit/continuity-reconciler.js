/*
 * Reconciles transient runtime state across replacement World Datasets.
 *
 * Focus is not reconciled here: context.focus.object_id on each World Dataset is
 * authoritative (see StateIndexer.build). Carrying a stale client selection forward would
 * be the runtime overriding World's focus.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime.ContinuityReconciler = {
        reconcile: function (previous, next) {
            if (previous && previous.actionResult) {
                next.actionResult = previous.actionResult;
            }

            return next;
        }
    };
}());
