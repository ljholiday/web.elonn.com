/*
 * Paint editor runtime adapter for hosted Paint document surfaces.
 */
(function () {
    'use strict';

    var runtime = window.ElonnWorldRuntime;
    var localOperations = {};
    var activeStroke = null;

    function sourceDocument(object) {
        var resources = Array.isArray(object.resources) ? object.resources : [];
        var source = null;
        resources.some(function (resource) {
            var content = resource && typeof resource.content === 'object' ? resource.content : {};
            if (String(content.kind || resource.kind || '') === 'paint.source' && content.source && typeof content.source === 'object') {
                source = content.source;
                return true;
            }
            return false;
        });

        return source && typeof source === 'object' ? source : {};
    }

    function mount(frame, object, context) {
        var content = object.content || {};
        var width = Number(content.width || 1024);
        var height = Number(content.height || 768);
        var canvas = document.createElement('canvas');

        canvas.className = 'paint-surface';
        canvas.dataset.paintSurface = 'true';
        canvas.dataset.objectId = object.id || '';
        canvas.width = width > 0 ? Math.round(width) : 1024;
        canvas.height = height > 0 ? Math.round(height) : 768;
        canvas.setAttribute('aria-label', String(object.title || 'Paint document') + ' canvas');
        if (width > 0 && height > 0) {
            canvas.style.aspectRatio = String(width) + ' / ' + String(height);
        }

        runtime.Common.replaceChildren(frame, [canvas]);
        render(canvas, object);

        canvas.addEventListener('pointerdown', function (event) {
            beginStroke(event, canvas, object, context);
        });
        canvas.addEventListener('pointermove', function (event) {
            appendStrokePoint(event);
        });
        canvas.addEventListener('pointerup', function (event) {
            endStroke(event, context);
        });
        canvas.addEventListener('pointercancel', function (event) {
            cancelStroke(event, canvas, object);
        });
    }

    function render(canvas, object) {
        var context = canvas.getContext ? canvas.getContext('2d') : null;
        var source = sourceDocument(object);
        var persisted = Array.isArray(source.operations) ? source.operations : null;
        var operations = persisted !== null ? persisted : (localOperations[String(object.id || '')] || []);
        if (!context) {
            return;
        }
        clearCanvas(canvas, context);
        operations.forEach(function (operation) {
            drawStroke(context, operation);
        });
    }

    function clearCanvas(canvas, context) {
        context.save();
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'rgba(255, 255, 255, 0)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }

    function beginStroke(event, canvas, object, context) {
        var drawingContext = canvas.getContext ? canvas.getContext('2d') : null;
        var objectId = String(object.id || '');
        if (objectId === '' || !drawingContext || event.button !== 0) {
            return;
        }
        if (typeof context.selectObject === 'function') {
            context.selectObject(objectId);
        }
        activeStroke = {
            pointerId: event.pointerId,
            objectId: objectId,
            canvas: canvas,
            context: drawingContext,
            points: [point(event, canvas)],
            color: '#000000',
            width: 4
        };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function appendStrokePoint(event) {
        var next = null;
        if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
            return;
        }
        next = point(event, activeStroke.canvas);
        activeStroke.points.push(next);
        drawStroke(activeStroke.context, {
            style: {
                color: activeStroke.color,
                width: activeStroke.width
            },
            geometry: {
                points: activeStroke.points.slice(-2)
            }
        });
        event.preventDefault();
    }

    function endStroke(event, context) {
        var stroke = null;
        if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
            return;
        }
        appendStrokePoint(event);
        stroke = {
            tool: 'pencil',
            style: {
                color: activeStroke.color,
                width: activeStroke.width
            },
            geometry: {
                points: simplify(activeStroke.points)
            }
        };
        if (stroke.geometry.points.length >= 2) {
            persistStroke(activeStroke.objectId, stroke, context);
        }
        activeStroke = null;
        event.preventDefault();
    }

    function cancelStroke(event, canvas, object) {
        if (activeStroke && activeStroke.pointerId === event.pointerId) {
            activeStroke = null;
            render(canvas, object);
        }
    }

    function persistStroke(objectId, stroke, context) {
        localOperations[objectId] = (localOperations[objectId] || []).concat([stroke]);
        context.status('Saving Paint stroke.', 'loading');
        context.dispatchSurfaceCommand({
            service: 'paint',
            kind: 'editor',
            operation: 'paint.draw',
            object_id: objectId,
            payload: {
                stroke: stroke
            }
        });
    }

    function point(event, canvas) {
        var rect = canvas.getBoundingClientRect();
        var x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * canvas.width : 0;
        var y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * canvas.height : 0;
        return {
            x: clamp(x, 0, canvas.width),
            y: clamp(y, 0, canvas.height)
        };
    }

    function simplify(points) {
        var output = [];
        points.forEach(function (item) {
            var previous = output[output.length - 1] || null;
            if (!previous || Math.abs(previous.x - item.x) >= 0.5 || Math.abs(previous.y - item.y) >= 0.5) {
                output.push({
                    x: Math.round(item.x * 100) / 100,
                    y: Math.round(item.y * 100) / 100
                });
            }
        });
        return output;
    }

    function drawStroke(context, stroke) {
        var style = stroke.style || {};
        var geometry = stroke.geometry || {};
        var points = Array.isArray(geometry.points) ? geometry.points : [];
        if (points.length < 2) {
            return;
        }
        context.save();
        context.strokeStyle = String(style.color || '#000000');
        context.lineWidth = Number(style.width || 4);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(Number(points[0].x || 0), Number(points[0].y || 0));
        points.slice(1).forEach(function (item) {
            context.lineTo(Number(item.x || 0), Number(item.y || 0));
        });
        context.stroke();
        context.restore();
    }

    function handleResponse(payload, command, context) {
        var errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
        var objectId = String(command.object_id || '');
        var stale = errors.some(function (error) {
            var code = String(error && error.code || '');
            var message = String(error && error.message || '');
            return code === 'mind.paint_document_not_found'
                || code === 'paint.document_not_found'
                || (message.indexOf('Paint endpoint returned HTTP 404.') !== -1 && message.indexOf('Paint document was not found.') !== -1);
        });
        if (!stale || objectId === '') {
            return;
        }

        delete localOperations[objectId];
        context.removeObjectSurface(objectId);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    runtime.AdapterRegistry.register('paint', 'editor', {
        mount: mount,
        handleResponse: handleResponse
    });
}());
