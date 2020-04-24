/**
 *
 * @module app.views.baseMessageList
 */

import Backbone from "backbone";

import * as Sentry from "@sentry/browser";
import MessageRenderVisitor from "./visitors/messageRenderVisitor.js";
import MessageRenderVisitorReSort from "./visitors/messageRenderVisitorReSort.js";
import MessageFamilyView from "./messageFamily.js";
import _ from "underscore";
import $ from "jquery";
import IdeaLoom from "../app.js";
import Ctx from "../common/context.js";
import Message from "../models/message.js";
import ScrollLogger from "./scrollLogger";
import i18n from "../utils/i18n.js";
import PostQuery from "./messageListPostQuery.js";
import Permissions from "../utils/permissions.js";
import MessagesInProgress from "../objects/messagesInProgress.js";
import scrollUtils from "../utils/scrollUtils.js";
import CollectionManager from "../common/collectionManager.js";
import Promise from "bluebird";

/**
 * Constants
 */
var MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX = "js_messageList-view-";

var /* The maximum number of messages that can be loaded at the same time
     * before being removed from memory
     */
    MAX_MESSAGES_IN_DISPLAY = 50;

var /* The number of messages to load each time the user scrolls to
     * the end or beginning of the list.
     */
    MORE_PAGES_NUMBER = 20;

var SLOW_WORKER_DELAY_VALUE = 20;

/**
 * A mixin for message list behaviour. Logic here, UI in subclasses.
 * Note: implementing the mixin as a class->class functor is inspired by
 * http://justinfagnani.com/2015/12/21/real-mixins-with-javascript-classes/
 * @class app.views.baseMessageList.BaseMessageListMixin
 */
function BaseMessageListMixinFactory(cls) {
    class BaseMessageListMixin extends cls.extend({
        // Can be overriden in subclass
        debugPaging: false,
        _renderId: 0,

        // Override with a superset
        ui: {
            panelBody: ".panel-body",
            topArea: ".js_messageList-toparea",
            bottomArea: ".js_messageList-bottomarea",
            messageList: ".messageList-list",
            messageFamilyList: ".js_messageFamilies_region",
            pendingMessage: ".pendingMessage",
            contentPending: ".real-time-updates",
        },

        // Also make sure you define or inherit getGroupState, getContainingGroup

        ViewStyles: {
            RECENTLY_ACTIVE_THREADS: {
                id: "recent_active_threads",
                css_class:
                    MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX +
                    "recent_active_threads",
                label: i18n.gettext("Recently active threads"),
            },
            RECENT_THREAD_STARTERS: {
                id: "recent_thread_starters",
                css_class:
                    MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX +
                    "recent_threads_starters",
                label: i18n.gettext("Recently started threads"),
            },
            THREADED: {
                id: "threaded",
                css_class: MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX + "threaded",
                label: i18n.gettext("Chronological threads"),
            },
            NEW_MESSAGES: {
                id: "new_messages",
                css_class:
                    MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX + "newmessages",
                label: i18n.gettext(
                    "Chronological threads + jump to oldest unread message"
                ),
            },
            CHRONOLOGICAL: {
                id: "chronological",
                css_class:
                    MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX + "chronological",
                label: i18n.gettext("Oldest messages first"),
            },
            REVERSE_CHRONOLOGICAL: {
                id: "reverse_chronological",
                css_class:
                    MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX + "activityfeed",
                label: i18n.gettext("Newest messages first"),
            },
            POPULARITY: {
                id: "popularity",
                css_class:
                    MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX + "popularmessages",
                label: i18n.gettext("Most popular messages first"),
            },
            /*
    CHRONOLOGICAL: {
      id: "chronological",
      css_class: MESSAGE_LIST_VIEW_STYLES_CLASS_PREFIX + "chronological",
      label: i18n.gettext('Oldest first')
    }*/
        },

        currentViewStyle: null,

        /**
         * If there were any render requests inhibited while rendering was
         * processed
         */
        numRenderInhibitedDuringRendering: 0,

        storedMessageListConfig: Ctx.DEPRECATEDgetMessageListConfigFromStorage(),

        /**
         * The collapse/expand flag
         * @type {boolean}
         */
        collapsed: false,

        /**
         * Stores the first offset of messages currently onscreen
         *
         * @type {number}
         */
        offsetStart: undefined,

        /**
         * Stores the last offset of messages currently onscreen
         * @type {number}
         */
        offsetEnd: undefined,

        /**
         * The annotator reference
         * @type {Annotator}
         */
        annotator: null,

        /**
         * The current server-side query applied to messages
         * @type {Object}
         */
        currentQuery: null,

        annotator_config: {
            externals: {
                jQuery: static_url + "/node_modules/jquery/dist/jquery.min.js",
                styles: static_url + "/js/build/annotator_ext.css",
            },
        },
    }) {
        constructor() {
            super(...arguments);
        }

        // Override
        initialize(options) {
            //console.log("messageList::initialize()");
            cls.prototype.initialize.apply(this, arguments);
            var that = this;
            this.scrollLogger = new ScrollLogger(that);
            //Be carefull modifying this
            //http://demo.nimius.net/debounce_throttle/
            this.logScroll = _.throttle(
                this.logScroll_base,
                ScrollLogger.getScrollLogInterval(),
                { leading: true, trailing: true }
            );
            var collectionManager = new CollectionManager();
            var d = new Date();
            this.renderIsComplete = false;
            this.showMessageByIdInProgress = false;
            this.renderedMessageViewsCurrent = {};
            this._renderedMessageFamilyViews = [];
            this._nbPendingMessage = 0;
            this.aReplyBoxHasFocus = false;
            this.currentQuery = new PostQuery();

            this.expertViewIsAvailable = !Ctx.getCurrentUser().isUnknownUser(); // TODO: enable it also for logged out visitors (but for this we need to disable user-related filters, like read)
            this.annotatorIsEnabled = Ctx.getCurrentUser().can(
                Permissions.ADD_EXTRACT
            );

            this.setViewStyle(
                this.getViewStyleDefById(
                    this.storedMessageListConfig.viewStyleId
                )
            );
            this.defaultMessageStyle =
                Ctx.getMessageViewStyleDefById(
                    this.storedMessageListConfig.messageStyleId
                ) || Ctx.AVAILABLE_MESSAGE_VIEW_STYLES.FULL_BODY;

            collectionManager
                .getAllMessageStructureCollectionPromise()
                .then(function (allMessageStructureCollection) {
                    if (!that.isDestroyed()) {
                        that.resetPendingMessages(
                            allMessageStructureCollection
                        );
                        that.listenTo(
                            allMessageStructureCollection,
                            "add",
                            that.addPendingMessage
                        );
                    }
                });

            if (this.annotatorIsEnabled) {
                collectionManager
                    .getAllExtractsCollectionPromise()
                    .then(function (allExtractsCollection) {
                        if (!that.isDestroyed()) {
                            that.listenToOnce(
                                allExtractsCollection,
                                "add remove reset",
                                function (eventName) {
                                    // console.log("about to call initAnnotator because allExtractsCollection was updated with:", eventName);
                                    that.initAnnotator();
                                }
                            );
                        }
                    });
            }
        }

        // Override
        showAnnouncement(announcement) {}

        // Override
        showTopPostBox(options) {}

        /**
         * Synchronizes the panel with the currently selected idea (possibly none)
         * override in subclass
         */
        syncWithCurrentIdea() {}

        // OVERRIDE
        renderMessageListHeader() {}

        // OVERRIDE
        onBeforeRender() {
            //Save some state from the previous render
            if (this.$el) {
                this.saveMessagesInProgress();
                this._clearPostRenderSlowCallbacksCallbackProcessing();
                this._previousScrollTarget = this.getPreviousScrollTarget();

                //Cleanup
                Ctx.removeCurrentlyDisplayedTooltips(this.$el);
            }

            if (this.currentQuery.isQueryValid()) {
                this.setLoading(false);
            } else if (this.getGroupState().get("currentIdea") !== null) {
                this.setLoading(false);

                //We will sync with current idea in onRender
            }
            this.resetScrollLogger();
        }

        // OVERRIDE
        onRender() {
            this.renderIsComplete = false; //only showMessages should set this false
            this._renderId++;
            if (Ctx.debugRender) {
                console.log(
                    "messageList:onRender() is firing for render id:",
                    this._renderId
                );
            }

            //Clear internal state
            this._offsetStart = undefined;
            this._offsetEnd = undefined;

            //FIXME once marionettization is complete
            //console.log("messageList onRender() this.newTopicView:", this.newTopicView);
        }

        onDetach() {
            if (this.scrollLogger) {
                this.scrollLogger.finalize();
            }
        }
        // OVERRIDE
        isInPrintableView() {
            return false;
        }

        // OVERRIDE
        toggleFilterByPostId(postId) {
            // Noop locally
        }

        /**
         * Is the view style a non-flat view
         */
        isViewStyleThreadedType(viewStyle) {
            return (
                viewStyle === this.ViewStyles.THREADED ||
                viewStyle === this.ViewStyles.NEW_MESSAGES ||
                viewStyle === this.ViewStyles.RECENTLY_ACTIVE_THREADS ||
                viewStyle === this.ViewStyles.RECENT_THREAD_STARTERS
            );
        }

        isCurrentViewStyleThreadedType() {
            return this.isViewStyleThreadedType(this.currentViewStyle);
        }

        /* Saves in local storage the unfinished messages that a user has started typing */
        saveMessagesInProgress() {
            if (this.newTopicView !== undefined) {
                this.newTopicView.savePartialMessage();
            }

            // Otherwise I need to work from the DOM and not view objects, for those are buried in messages
            var messageFields = this.$(".js_messageSend-body");

            function not_empty(b) {
                return b.value.length !== 0;
            }

            messageFields = _.filter(messageFields, not_empty);

            _.each(messageFields, function (f) {
                var parent_messages = $(f).parents(".message");
                if (parent_messages.length > 0) {
                    var messageId = parent_messages[0].attributes
                        .getNamedItem("id")
                        .value.substr(8);
                    MessagesInProgress.saveMessage(messageId, f.value);
                } else {
                    // this was the newTopicView
                }
            });
        }

        /**
         * get a view style definition by id
         * @param {viewStyle.id} viewStyleId
         * @returns {viewStyle | undefined}
         */
        getViewStyleDefById(viewStyleId) {
            var retval = _.find(this.ViewStyles, function (viewStyle) {
                return viewStyle.id === viewStyleId;
            });
            return retval;
        }

        ideaChanged() {
            var that = this;
            this.getPanelWrapper().filterThroughPanelLock(function () {
                that.syncWithCurrentIdea();
            }, "syncWithCurrentIdea");
        }

        /**
         * This code is used to store the scroll position before the entire message
         * list is been re-rendered.  This will be restored later using
         * scrollToPreviousScrollTarget
         *
         * Note:  this.renderedMEssageViewsCurrent must not have been
         * for this function to work.
         */
        getPreviousScrollTarget() {
            var panelOffset = null;
            var panelScrollTop = 0;
            var messageViewScrolledInto = null;
            var messageViewScrolledIntoOffset = -Number.MAX_VALUE;
            var retval = null;
            var debug = false;

            //We may have been called on the first render, so we have to check
            if (
                _.isFunction(this.ui.panelBody.size) &&
                this.ui.panelBody.offset() !== undefined
            ) {
                panelOffset = this.getCurrentViewPortTop();
                panelScrollTop = this.ui.panelBody.scrollTop();
                if (debug) {
                    console.log(
                        "this.ui.panelBody",
                        this.ui.panelBody,
                        "panelScrollTop",
                        panelScrollTop
                    );
                }

                if (panelScrollTop !== 0) {
                    // Scrolling to the element
                    //var target = offset - panelOffset + panelBody.scrollTop();
                    //console.log("panelOffset", panelOffset);
                    var selector = $(".message");
                    if (this.renderedMessageViewsCurrent === undefined) {
                        throw new Error(
                            "this.renderedMessageViewsCurrent is undefined"
                        );
                    }

                    _.each(this.renderedMessageViewsCurrent, function (view) {
                        var retval = true;

                        //console.log("view",view);
                        var collection = view.$el
                            .find(selector)
                            .addBack(selector);

                        //console.log("collection", collection);
                        collection.each(function () {
                            //console.log(this);
                            var messageOffset =
                                $(this).offset().top - panelOffset;

                            //console.log("message ", $(this).attr('id'), "position", messageOffset);
                            if (messageOffset < 0) {
                                if (
                                    messageOffset >
                                    messageViewScrolledIntoOffset
                                ) {
                                    messageViewScrolledInto = view;
                                    messageViewScrolledIntoOffset = messageOffset;
                                }
                            } else {
                                // the list is not in display order in threaded view
                                // so I don't see a way to break out
                                // scroll position, break out of the loop
                                // retval = false;
                            }
                        });
                    });
                    if (messageViewScrolledInto) {
                        //console.log("message in partial view has subject:", messageViewScrolledInto.model.get('subject'));
                        var messageHtmlId = messageViewScrolledInto.$el.attr(
                            "id"
                        );
                        retval = {
                            messageHtmlId: messageHtmlId,
                            innerOffset: messageViewScrolledIntoOffset,
                        };
                    }
                }
            }

            if (debug) {
                console.log("getPreviousScrollTarget returning: ", retval);
            }

            return retval;
        }

        scrollToPreviousScrollTarget(retrying) {
            var previousScrollTarget = this._previousScrollTarget;
            var debug = false;
            var that = this;

            if (previousScrollTarget && !this.isDestroyed()) {
                if (debug) {
                    console.log(
                        "scrollToPreviousScrollTarget(): Trying to scroll to:",
                        previousScrollTarget
                    ); // example: "message-local:Content/5232"
                }

                //We may have been called on the first render, so we have to check
                if (this.ui.panelBody.offset() !== undefined) {
                    // console.log("previousScrollTarget.messageHtmlId: ~" + previousScrollTarget.messageHtmlId + "~" );
                    // We have to escape some characters for the JQuery CSS selector to work. Function taken from http://learn.jquery.com/using-jquery-core/faq/how-do-i-select-an-element-by-an-id-that-has-characters-used-in-css-notation/
                    var buildIdSelector = function (myid) {
                        return myid.replace(/(:|\.|\[|\]|,)/g, "\\$1");
                    };
                    var selector = Ctx.format(
                        '[id="{0}"]',
                        buildIdSelector(previousScrollTarget.messageHtmlId)
                    ); // we could use '#{0}' or document.getElementById() but there could be problems if there are several messageLists. TODO: refactor by using a dedicated class for example
                    var message = this.$el.find(selector);
                    if (!_.size(message)) {
                        console.log(
                            "scrollToPreviousScrollTarget() can't find element with id:",
                            previousScrollTarget.messageHtmlId
                        );
                        if (!retrying) {
                            retrying = 0;
                        }
                        if (retrying < 2) {
                            ++retrying;
                            setTimeout(function () {
                                console.log("retrying x ", retrying);
                                that.scrollToPreviousScrollTarget(retrying);
                            });
                        }
                        return;
                    }

                    // Scrolling to the element
                    //console.log("Scrolling to previous scroll target");
                    scrollUtils.scrollToElementAndWatch(
                        message,
                        undefined,
                        previousScrollTarget.innerOffset,
                        false
                    );
                }
            }
        }

        /**
         * Calculate the offsets of messages actually displayed from a request
         * @returns The actual offset array
         */
        calculateMessagesOffsets(visitorData, requestedOffsets) {
            var returnedDataOffsets = {};
            var len = _.size(visitorData.visitorOrderLookupTable);

            if (this.isCurrentViewStyleThreadedType()) {
                returnedDataOffsets = this._calculateThreadedMessagesOffsets(
                    visitorData,
                    requestedOffsets
                );
            } else {
                returnedDataOffsets.offsetStart = _.isUndefined(
                    requestedOffsets.offsetStart
                )
                    ? 0
                    : requestedOffsets.offsetStart;
                returnedDataOffsets.offsetEnd = _.isUndefined(
                    requestedOffsets.offsetEnd
                )
                    ? MORE_PAGES_NUMBER
                    : requestedOffsets.offsetEnd;
                if (returnedDataOffsets.offsetEnd < len) {
                    // if offsetEnd is bigger or equal than len, do not use it
                    len = returnedDataOffsets.offsetEnd + 1;
                } else {
                    returnedDataOffsets.offsetEnd = len - 1;
                }
            }

            if (this.debugPaging) {
                console.log(
                    "calculateMessagesOffsets() called with requestedOffsets:",
                    requestedOffsets,
                    " returning ",
                    returnedDataOffsets
                );
            }

            return returnedDataOffsets;
        }

        _calculateThreadedMessagesOffsets(visitorData, requestedOffsets) {
            var returnedDataOffsets = {};
            var numMessages = visitorData.visitorOrderLookupTable.length;

            if (numMessages > 0) {
                //Find preceding root message, and include it
                //It is not possible that we do not find one if there is
                //at least one message
                //Gaby: Never declare an incremental variable "i" out of loop, it's a memory leak
                for (var i = requestedOffsets.offsetStart; i >= 0; i--) {
                    if (
                        visitorData.visitorViewData[
                            visitorData.visitorOrderLookupTable[i]
                        ]["last_ancestor_id"] === null
                    ) {
                        returnedDataOffsets.offsetStart = i;
                        break;
                    }
                }
            } else {
                returnedDataOffsets.offsetStart = 0;
                returnedDataOffsets.offsetEnd = 0;
                return returnedDataOffsets;
            }

            if (requestedOffsets.offsetEnd > numMessages - 1) {
                returnedDataOffsets.offsetEnd = numMessages - 1;
            } else {
                const offsetEnd = requestedOffsets.offsetEnd || numMessages - 1;
                if (
                    visitorData.visitorViewData[
                        visitorData.visitorOrderLookupTable[offsetEnd]
                    ]["last_ancestor_id"] === null
                ) {
                    returnedDataOffsets.offsetEnd = offsetEnd;
                } else {
                    //If the requested offsetEnd isn't a root, find next root message, and stop just
                    //before it

                    for (
                        var i = requestedOffsets.offsetEnd;
                        i < numMessages;
                        i++
                    ) {
                        if (
                            visitorData.visitorViewData[
                                visitorData.visitorOrderLookupTable[i]
                            ]["last_ancestor_id"] === null
                        ) {
                            returnedDataOffsets.offsetEnd = i;
                            break;
                        }
                    }

                    if (returnedDataOffsets.offsetEnd === undefined) {
                        //It's possible we didn't find a root, if we are at the very end of the list
                        returnedDataOffsets.offsetEnd = numMessages;
                    }
                }
            }

            return returnedDataOffsets;
        }

        /**
         * @param messageId of the message that we want onscreen
         * @returns {} requetedOffset structure
         */
        calculateRequestedOffsetToShowMessage(
            messageId,
            visitorData,
            resultMessageIdCollection
        ) {
            return this.calculateRequestedOffsetToShowOffset(
                this.getMessageOffset(
                    messageId,
                    visitorData,
                    resultMessageIdCollection
                )
            );
        }

        /**
         * @param messageOffset of the message that we want onscreen
         * @returns {} requetedOffset structure
         */
        calculateRequestedOffsetToShowOffset(messageOffset) {
            var requestedOffsets = {};
            var requestedOffsets;

            requestedOffsets.offsetStart = null;
            requestedOffsets.offsetEnd = null;

            if (
                this._offsetStart !== undefined &&
                messageOffset < this._offsetStart &&
                messageOffset > this._offsetStart - MAX_MESSAGES_IN_DISPLAY
            ) {
                //If within allowable messages currently onscreen, we "extend" the view
                requestedOffsets.offsetStart = messageOffset;
                if (
                    this._offsetEnd - requestedOffsets.offsetStart <=
                    MAX_MESSAGES_IN_DISPLAY
                ) {
                    requestedOffsets.offsetEnd = this._offsetEnd;
                } else {
                    requestedOffsets.offsetEnd =
                        requestedOffsets.offsetStart + MAX_MESSAGES_IN_DISPLAY;
                }
            } else if (
                this._offsetEnd !== undefined &&
                messageOffset > this._offsetEnd &&
                messageOffset < this._offsetEnd + MAX_MESSAGES_IN_DISPLAY
            ) {
                //If within allowable messages currently onscreen, we "extend" the view
                requestedOffsets.offsetEnd = messageOffset;
                if (
                    requestedOffsets.offsetEnd - this._offsetStart <=
                    MAX_MESSAGES_IN_DISPLAY
                ) {
                    requestedOffsets.offsetStart = this._offsetStart;
                } else {
                    requestedOffsets.offsetStart =
                        requestedOffsets.offsetEnd - MAX_MESSAGES_IN_DISPLAY;
                }
            } else {
                //Else we request an offset centered on the message
                requestedOffsets.offsetStart =
                    messageOffset - Math.floor(MORE_PAGES_NUMBER / 2);
                if (requestedOffsets.offsetStart < 0) {
                    requestedOffsets.offsetStart = 0;
                }

                requestedOffsets.offsetEnd =
                    requestedOffsets.offsetStart + MORE_PAGES_NUMBER;
            }

            return requestedOffsets;
        }

        /** Essentially the default value of showMessages.
         * Whoever first calls it will get this as the first value of the messagelist upon render */
        requestMessages(requestedOffsets) {
            this._requestedOffsets = requestedOffsets;
        }

        /**
         * Get the message ids to show, or shown onscreen for a specific
         * offset
         * @returns list of message ids, in the order they are shown onscreen
         * */
        getMessageIdsToShow(
            resultMessageIdCollection,
            visitorData,
            requestedOffsets
        ) {
            var messageIdsToShow = [];
            var returnedOffsets = this.calculateMessagesOffsets(
                visitorData,
                requestedOffsets
            );

            if (this.isCurrentViewStyleThreadedType()) {
                messageIdsToShow = visitorData.visitorOrderLookupTable.slice(
                    returnedOffsets.offsetStart,
                    returnedOffsets.offsetEnd + 1
                );
            } else {
                if (this.debugPaging) {
                    console.log(
                        "getMessageIdsToShow() about to slice collection",
                        resultMessageIdCollection
                    );
                }

                messageIdsToShow = resultMessageIdCollection.slice(
                    returnedOffsets.offsetStart,
                    returnedOffsets.offsetEnd + 1
                );
            }

            if (this.debugPaging) {
                console.log(
                    "getMessageIdsToShow() called with requestedOffsets:",
                    requestedOffsets,
                    " returning ",
                    _.size(messageIdsToShow),
                    "/",
                    _.size(resultMessageIdCollection),
                    " message ids: ",
                    messageIdsToShow
                );
            }

            return messageIdsToShow;
        }

        /**
         * Load the new batch of messages according to the requested `offsetStart`
         * and `offsetEnd` prop
         *
         * If requestedOffsets is falsy, the value set by requestMessages is used
         *
         * @returns a Promise to true, resolved when done
         */
        showMessages(requestedOffsets) {
            var that = this;
            var views_promise;
            var offsets;
            var numMessages;
            var messageIdsToShow;
            var returnedOffsets = {};
            var messageFullModelsToShowPromise;
            var previousScrollTarget;

            //Because of a hack to call showMessageById from render_real
            //Note that this can also be set to false in onRender()
            this.renderIsComplete = false;

            if (this.debugPaging || Ctx.debugRender) {
                console.log(
                    "showMessages() called with requestedOffsets:",
                    requestedOffsets
                );
            }

            if (!requestedOffsets) {
                if (requestedOffsets === undefined) {
                    if (that.debugPaging) {
                        console.log(
                            "showMessages() setting offset request to default:",
                            this._requestedOffsets
                        );
                    }

                    this.requestMessages({
                        offsetStart: 0,
                        offsetEnd: MORE_PAGES_NUMBER,
                    });
                }

                if (that.debugPaging) {
                    console.log(
                        "showMessages() using previously set offset request:",
                        this._requestedOffsets
                    );
                }

                requestedOffsets = this._requestedOffsets;
            } else {
                this._requestedOffsets = requestedOffsets;
            }

            previousScrollTarget = this.getPreviousScrollTarget();
            if (previousScrollTarget) {
                //The above will only succeed if we are paging.
                //But the previousScrollTarget MAY have been set successfully
                //in onBeforeRender (if this isn't the first render), so we
                //only overwrite it if it actually succeeded
                this._previousScrollTarget = previousScrollTarget;
            }

            /* The MessageFamilyView will re-fill the renderedMessageViewsCurrent
             * array with the newly calculated rendered MessageViews.
             */
            this.renderedMessageViewsCurrent = {};
            this.suspendAnnotatorRefresh();
            return Promise.join(
                this.currentQuery.getResultMessageIdCollectionPromise(),
                this.getVisitorDataPromise(),
                function (resultMessageIdCollection, visitorData) {
                    returnedOffsets = that.calculateMessagesOffsets(
                        visitorData,
                        requestedOffsets
                    );
                    messageIdsToShow = that.getMessageIdsToShow(
                        resultMessageIdCollection,
                        visitorData,
                        requestedOffsets
                    );
                    numMessages = _.size(resultMessageIdCollection);
                    if (that.isCurrentViewStyleThreadedType()) {
                        views_promise = that.getRenderedMessagesThreadedPromise(
                            _.clone(visitorData.visitorRootMessagesToDisplay),
                            1,
                            visitorData,
                            messageIdsToShow
                        );
                    } else {
                        views_promise = that.getRenderedMessagesFlatPromise(
                            messageIdsToShow
                        );
                    }

                    that._offsetStart = returnedOffsets.offsetStart;
                    that._offsetEnd = returnedOffsets.offsetEnd;

                    var currentIdea = that.getGroupState().get("currentIdea");
                    var announcementPromise = null;
                    var announcementMessageView;
                    if (
                        currentIdea &&
                        that.currentQuery.isFilterInQuery(
                            that.currentQuery.availableFilters
                                .POST_IS_IN_CONTEXT_OF_IDEA,
                            currentIdea.getId()
                        )
                    ) {
                        announcementPromise = currentIdea.getApplicableAnnouncementPromise();
                    }

                    return Promise.join(
                        views_promise,
                        announcementPromise,
                        function (views, announcement) {
                            if (that.debugPaging) {
                                console.log(
                                    "showMessages() showing requestedOffsets:",
                                    requestedOffsets,
                                    "returnedOffsets:",
                                    returnedOffsets,
                                    "messageIdsToShow",
                                    messageIdsToShow,
                                    "out of numMessages",
                                    numMessages,
                                    "root views",
                                    views
                                );
                            }

                            if (views.length === 0) {
                                //TODO:  This is probably where https://app.asana.com/0/15264711598672/20633284646643 occurs
                                that.ui.messageFamilyList.append(
                                    Ctx.format(
                                        "<div class='margin'>{0}</div>",
                                        i18n.gettext("No messages")
                                    )
                                );
                            }

                            if (announcement && that._offsetStart <= 0) {
                                //Only display the announcement on the first page
                                that.showAnnouncement(announcement);
                            }

                            if (views.length > 0) {
                                if (
                                    that
                                        .getContainingGroup()
                                        .model.get("navigationState") !==
                                    "synthesis"
                                ) {
                                    // dynamically add id to the first view of message to enable take tour
                                    views[0].$el.attr(
                                        "id",
                                        "tour_step_message"
                                    );
                                    IdeaLoom.tour_vent.trigger(
                                        "requestTour",
                                        "first_message"
                                    );
                                }

                                _.each(views, function (view) {
                                    that.ui.messageFamilyList.append(view.el);
                                });
                            }

                            that.scrollToPreviousScrollTarget();
                            that.$el
                                .find(".js_messageList-loadprevloader")
                                .addClass("hidden");
                            if (that._offsetStart <= 0) {
                                that.ui.topArea.addClass("hidden");
                            } else {
                                that.ui.topArea.removeClass("hidden");
                            }

                            that.$el
                                .find(".js_messageList-loadmoreloader")
                                .addClass("hidden");
                            if (that._offsetEnd >= numMessages - 1) {
                                that.ui.bottomArea.addClass("hidden");
                            } else {
                                that.ui.bottomArea.removeClass("hidden");
                            }

                            that.resumeAnnotatorRefresh();
                            that.unblockPanel();
                            that.renderIsComplete = true;
                            that.trigger(
                                "messageList:render_complete",
                                "Render complete"
                            );
                            return true;
                        }
                    );
                }
            ).catch(function (e) {
                if (raven_url) {
                    Sentry.captureException(e);
                }
                that.ui.messageFamilyList.add(
                    "<div class='error'>We are sorry, a technical error occured during rendering.</div>"
                );
                //For debugging, uncomment the following to get stack traces add true || at the begining of the if
                if (that.debugPaging || Ctx.debugRender || !raven_url) {
                    throw e;
                }
            });
        }

        /**
         * Used for processing costly operations that needs to happen after
         * the dom is displayed to the user.
         *
         * It will be processed with a delay between each call to avoid locaking the browser
         */
        requestPostRenderSlowCallback(callback) {
            this._postRenderSlowCallbackStack.push(callback);
        }

        /**
         * The worker
         */
        _postRenderSlowCallbackWorker(messageListView) {
            var that = this;

            //console.log("_postRenderSlowCallbackWorker fired, stack length: ", this._postRenderSlowCallbackStack.length)
            if (this.isDestroyed()) {
                // this case is hypothetical.
                this._postRenderSlowCallbackStack = [];
                return;
            }

            if (this._postRenderSlowCallbackStack.length > 0) {
                //console.log("_postRenderSlowCallbackWorker fired with non-empty stack, popping a callback from stack of length: ", this._postRenderSlowCallbackStack.length)
                var callback = this._postRenderSlowCallbackStack.shift();
                callback();
            }

            this._postRenderSlowCallbackWorkerInterval = setTimeout(
                function () {
                    that._postRenderSlowCallbackWorker();
                },
                SLOW_WORKER_DELAY_VALUE
            );
        }

        /**
         *
         */
        _startPostRenderSlowCallbackProcessing() {
            var that = this;
            this._postRenderSlowCallbackWorkerInterval = setTimeout(
                function () {
                    that._postRenderSlowCallbackWorker();
                },
                SLOW_WORKER_DELAY_VALUE
            );
        }
        /**
         * Stops processing and clears the queue
         */
        _clearPostRenderSlowCallbacksCallbackProcessing() {
            clearTimeout(this._postRenderSlowCallbackWorkerInterval);
            this._postRenderSlowCallbackStack = [];
        }

        /**
         * Re-init Annotator.  Needs to be done for all messages when any
         * single message has been re-rendered.  Otherwise, the annotations
         * will not be shown.
         */
        _doAnnotatorRefresh() {
            if (Ctx.debugAnnotator) {
                console.log(
                    "messageList:_doAnnotatorRefresh() called for " +
                        _.size(this.renderedMessageViewsCurrent) +
                        " messages on render id ",
                    _.clone(this._renderId)
                );
            }
            if (!this.isDestroyed()) {
                this.annotatorRefreshRequested = false;

                //console.log("_doAnnotatorRefresh(): About to call initAnnotator");
                this.initAnnotator();
                _.each(this.renderedMessageViewsCurrent, function (
                    messageView
                ) {
                    messageView.loadAnnotations();
                });
            }
        }

        // each fully-displayed message asks the messageList for an anotator refresh, so to avoid doing it too often, we use a throttled version of the requestAnnotatorRefresh() method
        doAnnotatorRefreshDebounced() {
            var that = this;
            if (this._debouncedRefresh === undefined) {
                this._debouncedRefresh = _.debounce(
                    _.bind(this._doAnnotatorRefresh, this),
                    100
                );
            }

            if (Ctx.debugAnnotator) {
                console.log(
                    "messageList:doAnnotatorRefreshDebounced called for render id ",
                    _.clone(this._renderId)
                );
            }
            this._debouncedRefresh();
        }

        /**
         * Should be called by a messageview anytime it has annotations and has
         * rendered a view that shows annotations.
         * This method is redefined in initialize() as a throttled version of itself.
         * Each fully-displayed message calls explicitly this method (in message::onRender()). (TODO?: Use events instead)
         */
        requestAnnotatorRefresh() {
            if (!this.annotatorIsEnabled) {
                return;
            }
            if (this.annotatorRefreshSuspended === true) {
                this.annotatorRefreshRequested = true;
            } else {
                this.doAnnotatorRefreshDebounced();
            }
        }

        /**
         * Suspends annotator refresh during initial render
         */
        suspendAnnotatorRefresh() {
            this.annotatorRefreshSuspended = true;
        }
        /**
         * Will call a refresh synchronously if any refresh was requested
         * while suspended
         */
        resumeAnnotatorRefresh() {
            this.annotatorRefreshSuspended = false;
            if (this.annotatorRefreshRequested === true) {
                if (Ctx.debugAnnotator) {
                    console.log(
                        "About to call _doAnnotatorRefresh synchronously"
                    );
                }
                this._doAnnotatorRefresh();
            }
        }

        /**
         * Show the next bunch of messages to be displayed.
         */
        showNextMessages() {
            var requestedOffsets = {};
            this.$el
                .find(".js_messageList-loadmoreloader")
                .removeClass("hidden");
            this.ui.bottomArea.addClass("hidden");
            requestedOffsets = this.getNextMessagesRequestedOffsets();

            //console.log("showNextMessages calling showMessages");
            this.showMessages(requestedOffsets);
        }

        /**
         * Show the previous bunch of messages to be displayed
         */
        showPreviousMessages() {
            var requestedOffsets = {};
            this.$el
                .find(".js_messageList-loadprevloader")
                .removeClass("hidden");
            this.ui.topArea.addClass("hidden");
            requestedOffsets = this.getPreviousMessagesRequestedOffsets();

            //console.log("showPreviousMessages calling showMessages");
            this.showMessages(requestedOffsets);
        }

        /**
         * Show all messages on screen, regardless of the time it will take.
         */
        showAllMessagesAtOnce() {
            var that = this;
            this.$el
                .find(".js_messageList-loadmoreloader")
                .removeClass("hidden");
            this.ui.bottomArea.addClass("hidden");
            this.currentQuery
                .getResultMessageIdCollectionPromise()
                .then(function (resultMessageIdCollection) {
                    var requestedOffsets = {
                        offsetStart: 0,
                        offsetEnd: _.size(resultMessageIdCollection),
                    };

                    //console.log("showAllMessages calling showMessages");
                    that.showMessages(requestedOffsets);
                });
        }

        /**
         * Get the requested offsets when scrolling down
         * @private
         */
        getNextMessagesRequestedOffsets() {
            var retval = {};

            retval.offsetEnd = this._offsetEnd + MORE_PAGES_NUMBER;

            if (
                retval.offsetEnd - this._offsetStart >
                MAX_MESSAGES_IN_DISPLAY
            ) {
                retval.offsetStart =
                    this._offsetStart +
                    (retval.offsetEnd -
                        this._offsetStart -
                        MAX_MESSAGES_IN_DISPLAY);
            } else {
                retval.offsetStart = this._offsetStart;
            }

            retval["scrollTransitionWasAtOffset"] = this._offsetEnd;
            return retval;
        }

        /**
         * Get the requested offsets when scrolling up
         * @private
         */
        getPreviousMessagesRequestedOffsets() {
            var messagesInDisplay;
            var retval = {};

            retval.offsetStart = this._offsetStart - MORE_PAGES_NUMBER;
            if (retval.offsetStart < 0) {
                retval.offsetStart = 0;
            }

            if (
                this._offsetEnd - retval.offsetStart >
                MAX_MESSAGES_IN_DISPLAY
            ) {
                retval.offsetEnd =
                    this._offsetEnd -
                    (this._offsetEnd -
                        retval.offsetStart -
                        MAX_MESSAGES_IN_DISPLAY);
            } else {
                retval.offsetEnd = this._offsetEnd;
            }

            retval.scrollTransitionWasAtOffset = this._offsetStart;
            return retval;
        }

        /**
         * @returns {number} returns the current number of messages displayed
         * in the message list
         */
        getCurrentNumberOfMessagesDisplayed() {
            var ret = 0;
            /*
     * This recursively calculates the number of children for every
     * root.  Not required unless we implement breaking in the middle of
     * a thread (and would still needs to be modified). benoitg- 2014-05-16
     _.each(this.renderedMessageViewsCurrent, function(message){
     if( ! message.model.get('parentId') ){
     ret += message.model.getDescendantsCount() + 1;
     }
     });
     */
            ret = _.size(this.renderedMessageViewsCurrent);
            return ret;
        }

        serializeData() {
            return {
                Ctx: Ctx,

                //availableViewStyles: this.ViewStyles,
                currentViewStyle: this.currentViewStyle,
                collapsed: this.collapsed,
                canPost: Ctx.getCurrentUser().can(Permissions.ADD_POST),
            };
        }

        isMessageIdInResults(messageId, resultMessageIdList) {
            //console.log("isMessageIdInResults called with ", messageId, resultMessageIdList)
            if (!resultMessageIdList) {
                throw new Error(
                    "isMessageIdInResults():  resultMessageIdList needs to be provided"
                );
            }

            return (
                undefined !=
                _.find(resultMessageIdList, function (resultMessageId) {
                    return messageId === resultMessageId;
                })
            );
        }

        /**
         * Retrieves the first new message id (if any) for the current user
         *
         * So returns the model of the oldest message in the current query that the
         * current user hasn't markd yet
         *
         * @returns Message.Model or undefined
         */
        findFirstUnreadMessageId(
            visitorData,
            messageCollection,
            resultMessageIdCollection
        ) {
            var that = this;
            return _.find(visitorData.visitorOrderLookupTable, function (
                messageId
            ) {
                var is_new =
                    messageCollection.get(messageId).get("read") === false;

                //console.log(is_new, messageCollection.get(messageId));
                return (
                    is_new &&
                    that.isMessageIdInResults(
                        messageId,
                        resultMessageIdCollection
                    )
                );
            });
        }

        /**
         * The actual rendering for the render function
         * @returns {views.Message}
         */
        render_real() {
            var that = this;
            var views = [];
            var renderId = _.clone(this._renderId);

            var // We could distinguish on current idea, but I think that would be confusing.
                partialMessageContext = "new-topic-" + Ctx.getDiscussionId();

            var partialMessage = MessagesInProgress.getMessage(
                partialMessageContext
            );

            if (Ctx.debugRender) {
                console.log(
                    "messageList:render_real() is firing for render id:",
                    renderId,
                    "the current view style is:",
                    this.currentViewStyle
                );
            }

            if (!Ctx.getCurrentUser().can(Permissions.ADD_EXTRACT)) {
                $("body").addClass("js_annotatorUserCannotAddExtract");
            }

            // Ctx.initTooltips(this.$el); // this takes way too much time when the DOM of the messagelist is big, so instead we init tooltips on selected subparts of the template. But here each subpart takes care of their own tooltips init so we don't need to call it.

            //this.renderCollapseButton(); // FIXME: this seems to be not used anymore, so I (Quentin) commented it out

            var options = {
                allow_setting_subject: true,
                send_button_label: i18n.gettext("Send"),
                subject_label: i18n.gettext("Subject"),
                body_help_message: i18n.gettext(
                    "Add a subject above and start a new topic here"
                ),
                mandatory_body_missing_msg: i18n.gettext(
                    "You need to type a comment first..."
                ),
                mandatory_subject_missing_msg: i18n.gettext(
                    "You need to set a subject to add a new topic..."
                ),
                msg_in_progress_ctx: partialMessageContext,
                msg_in_progress_title: partialMessage["title"],
                msg_in_progress_body: partialMessage["body"],
                messageList: that,
                show_target_context_with_choice: true,
            };

            var currentIdea = this.getGroupState().get("currentIdea");

            if (
                currentIdea &&
                this.currentQuery.isFilterInQuery(
                    this.currentQuery.availableFilters
                        .POST_IS_IN_CONTEXT_OF_IDEA,
                    currentIdea.getId()
                )
            ) {
                options.reply_idea = currentIdea;
            }

            if (
                Ctx.getCurrentUser().can(Permissions.ADD_POST) &&
                !this.isLoading()
            ) {
                this.showTopPostBox(options);
            }

            var collectionManager = new CollectionManager();
            Promise.join(
                this.currentQuery.getResultMessageStructureCollectionPromise(),
                this.currentQuery.getResultMessageIdCollectionPromise(),
                this.getVisitorDataPromise(),
                function (
                    allMessageStructureCollection,
                    resultMessageIdCollection,
                    visitorData
                ) {
                    if (Ctx.debugRender) {
                        console.log(
                            "messageList:render_real() collection ready, processing for render id:",
                            renderId
                        );
                    }

                    if (renderId != that._renderId) {
                        console.log(
                            "messageList:render_real() collections arrived too late, this is render %d, and render %d is already in progress.  Aborting.",
                            renderId,
                            that._renderId
                        );
                        return;
                    }

                    var first_unread_id = that.findFirstUnreadMessageId(
                        visitorData,
                        allMessageStructureCollection,
                        resultMessageIdCollection
                    );

                    //console.log("that.showMessageByIdInProgress", that.showMessageByIdInProgress);
                    if (
                        that.showMessageByIdInProgress === false &&
                        that.currentViewStyle ===
                            that.ViewStyles.NEW_MESSAGES &&
                        first_unread_id &&
                        !that._previousScrollTarget
                    ) {
                        that.renderIsComplete = true; //showMessageById will call showMessages and actually finish the render
                        //We do not trigger the render_complete event here, the line above is just to un-inhibit showMessageById
                        if (that.debugPaging) {
                            console.log(
                                "render_real: calling showMessageById to display the first unread message"
                            );
                        }

                        that.showMessageById(
                            first_unread_id,
                            undefined,
                            undefined,
                            false
                        );
                    } else if (
                        that.showMessageByIdInProgress === false &&
                        (that._offsetStart === undefined ||
                            that._offsetEnd === undefined)
                    ) {
                        //If there is nothing currently onscreen
                        //Would avoid rendering twice, and would allow showMessageById to just request showing messages systematically
                        if (that.debugPaging) {
                            console.log("render_real: calling showMessages");
                        }

                        that.showMessages();
                    } else {
                        if (that.debugPaging) {
                            console.log(
                                "render_real: Already running showMessageById will finish the job"
                            );
                        }

                        that.renderIsComplete = true;
                        that.trigger(
                            "messageList:render_complete",
                            "Render complete"
                        );
                    }

                    that._startPostRenderSlowCallbackProcessing();
                }
            );
            return this;
        }

        onBeforeDestroy() {
            this.saveMessagesInProgress();
        }

        arraysEqual(arr1, arr2) {
            if (arr1.length !== arr2.length) return false;
            for (var i = arr1.length; i--; ) {
                if (arr1[i] !== arr2[i]) return false;
            }

            return true;
        }

        /**
   * @returns {object}:
        visitorViewData: visitorViewData,
        visitorOrderLookupTable: visitorOrderLookupTable,
        visitorRootMessagesToDisplay: visitorRootMessagesToDisplay
      (See documentation below)
   */
        _generateVisitorData(
            messageStructureCollection,
            resultMessageIdCollection
        ) {
            /**
             * The array generated by MessageRenderVisitor's data_by_object
             * when visiting the message tree
             * @type {object}
             */
            var visitorViewData = {};

            var /**
                 * An index for the visitorViewData mapping traversal order with
                 * object id.  Generated by MessageRenderVisitor's order_lookup_table
                 * when visiting the message tree
                 * @type {Array}
                 */
                visitorOrderLookupTable = [];

            var /**
                 * A list of "root" messages that have no parent or ancestors in the set
                 * of messages to display.  GGenerated by MessageRenderVisitor's roots
                 * when visiting the message tree
                 * @type {Array}
                 */
                visitorRootMessagesToDisplay = [];

            var resultMessageIdCollectionReference = resultMessageIdCollection;
            var tempVisitorOrderLookupTable = [];
            var tempVisitorRootMessagesToDisplay = [];

            var inFilter = function (message) {
                return (
                    resultMessageIdCollectionReference.indexOf(
                        message.getId()
                    ) >= 0
                );
            };

            var visitorObject = new MessageRenderVisitor(
                visitorViewData,
                tempVisitorOrderLookupTable,
                tempVisitorRootMessagesToDisplay,
                inFilter
            );
            messageStructureCollection.visitDepthFirst(visitorObject);

            var sortFunction = undefined;
            if (
                this.currentViewStyle ===
                this.ViewStyles.RECENTLY_ACTIVE_THREADS
            ) {
                sortFunction = function (data) {
                    if (data.level === 0) {
                        return (
                            Date.now() - Date.parse(data.newest_descendant_date)
                        );
                    } else {
                        return Date.parse(data.object.get("date"));
                    }
                };
            } else if (
                this.currentViewStyle === this.ViewStyles.RECENT_THREAD_STARTERS
            ) {
                sortFunction = function (data) {
                    if (data.level === 0) {
                        return Date.now() - Date.parse(data.object.get("date"));
                    } else {
                        return Date.parse(data.object.get("date"));
                    }
                };
            } else if (
                this.currentViewStyle === this.ViewStyles.REVERSE_CHRONOLOGICAL
            ) {
                sortFunction = function (data) {
                    return Date.now() - Date.parse(data.object.get("date"));
                };
            } else if (this.currentViewStyle === this.ViewStyles.POPULARITY) {
                sortFunction = function (data) {
                    return [
                        -data.like_count,
                        Date.now() - Date.parse(data.object.get("date")),
                    ];
                };
            } else {
                sortFunction = function (data) {
                    return data.object.get("date");
                };
            }

            //SORT THE TREE
            MessageRenderVisitorReSort(
                visitorViewData,
                visitorOrderLookupTable,
                visitorRootMessagesToDisplay,
                sortFunction
            );
            /*console.log("_generateVisitorData(): visitorViewData: ", visitorViewData,
      "visitorOrderLookupTable: ", visitorOrderLookupTable,
      "visitorRootMessagesToDisplay: ", visitorRootMessagesToDisplay);*/
            return {
                visitorViewData: visitorViewData,
                visitorOrderLookupTable: visitorOrderLookupTable,
                visitorRootMessagesToDisplay: visitorRootMessagesToDisplay,
            };
        }

        getVisitorDataPromise() {
            var that = this;
            var collectionManager = new CollectionManager();

            return Promise.join(
                this.currentQuery.getResultMessageStructureCollectionPromise(),
                this.currentQuery.getResultMessageIdCollectionPromise(),
                function (
                    messageStructureCollection,
                    resultMessageIdCollection
                ) {
                    if (!that.isDestroyed()) {
                        if (that._cachedVisitorDataPromise !== undefined) {
                            //resultMessageIdCollection is a plain array, NOT a real collection
                            // Still, could we not use _.isEqual instead?
                            if (
                                !that.arraysEqual(
                                    that._cachedVisitorDataResultMessageIdCollection,
                                    resultMessageIdCollection
                                )
                            ) {
                                //console.log("getVisitorDataPromise: Invalidating cache");
                                that._cachedVisitorDataPromise = undefined;
                            }
                        }
                        if (that._cachedVisitorDataPromise === undefined) {
                            //console.log("getVisitorDataPromise: Cache MISS");
                            that._cachedVisitorDataPromise = Promise.resolve(
                                that._generateVisitorData(
                                    messageStructureCollection,
                                    resultMessageIdCollection
                                )
                            );
                            that._cachedVisitorDataResultMessageIdCollection = _.clone(
                                resultMessageIdCollection
                            );
                        } else {
                            //console.log("getVisitorDataPromise: Cache HIT");
                        }
                        return that._cachedVisitorDataPromise;
                    } else {
                        return Promise.reject("View was already destroyed");
                    }
                }
            );
        }

        onSetDefaultMessageStyle(defaultMessageStyle) {
            this.defaultMessageStyle = defaultMessageStyle;
        }

        clearRenderedMessages() {
            //console.log("clearRenderedMessages called");
            _.each(this._renderedMessageFamilyViews, function (messageFamily) {
                //MessageFamily is a Marionette view called from a non-marionette context,
                //so we call destroy, not remove
                messageFamily.destroy();
            });
            this._renderedMessageFamilyViews = [];
            this.renderedMessageViewsCurrent = {};
        }

        onDestroy() {
            this.clearRenderedMessages();
        }

        /**
         * Return a list with all views already rendered for a flat view
         * @param {Message.Model[]} messages
         * @param requestedOffsets The requested offsets
         * @param returnedDataOffsets The actual offsets of data actually returned (may be different
         * from requestedOffsets
         * @returns {HTMLDivElement[]}
         */
        getRenderedMessagesFlatPromise(requestedIds) {
            var view;
            var collectionManager = new CollectionManager();

            return Promise.join(
                this.currentQuery.getResultMessageStructureCollectionPromise(),
                this.getVisitorDataPromise(),
                (messageStructureModels, visitorData) => {
                    var list = [];
                    if (!this.isDestroyed()) {
                        this.clearRenderedMessages();
                        _.each(requestedIds, (messageId) => {
                            const messageModel = messageStructureModels.get(
                                messageId
                            );
                            if (!messageModel) {
                                Sentry.withScope((scope) => {
                                    scope.setExtra("messageId", messageId);
                                    throw new Error(
                                        "getRenderedMessagesFlatPromise: Unable to find message structure"
                                    );
                                });
                            }
                            view = new MessageFamilyView({
                                model: messageModel,
                                messageListView: this,
                                hasChildren: [],
                                visitorData: visitorData,
                            });
                            this._renderedMessageFamilyViews.push(view);
                            list.push(view);
                        });
                    }
                    //console.log("getRenderedMessagesFlatPromise():  Resolving promise with:",list);
                    return Promise.resolve(list);
                }
            );
        }

        /**
         * Return a list with all views already rendered for threaded views
         * WARNING: This is a recursive function
         * @param {Message.Model[]} list of messages to render at the current level
         * @param {number} [level=1] The current hierarchy level
         * @param {Object[]} data_by_object render information from ideaRendervisitor
         * @param {string[]} messageIdsToShow messageIds of the message to show (those in the offset range)
         * @returns {jquery.promise}
         */
        getRenderedMessagesThreadedPromise(
            sibblings,
            level,
            visitorData,
            messageIdsToShow
        ) {
            var that = this;
            var list = [];
            var i = 0;
            var view;
            var messageStructureModel;
            var children;
            var prop;
            var isValid;
            var last_sibling_chain;
            var current_message_info;
            var collectionManager = new CollectionManager();
            var debug = false;
            if (debug) {
                console.log(
                    "getRenderedMessagesThreadedPromise() num sibblings:",
                    _.size(sibblings),
                    "level:",
                    level,
                    "messageIdsToShow",
                    messageIdsToShow
                );
            }
            /**
             * @param message
             * @param data_by_object
             * @returns {boolean[]} which of the view's ancestors are the last child of their respective parents.
             */
            function buildLastSibblingChain(message, data_by_object) {
                var last_sibling_chain = [];
                var current_message_id = message.getId();
                var next_parent;
                var current_message_info;
                while (current_message_id) {
                    current_message_info = data_by_object[current_message_id];

                    //console.log("Building last sibbiling chain, current message: ",current_message_id, current_message_info);
                    last_sibling_chain.unshift(
                        current_message_info["is_last_sibling"]
                    );
                    current_message_id =
                        current_message_info["last_ancestor_id"];
                }

                return last_sibling_chain;
            }

            if (_.isUndefined(level)) {
                level = 1;
            }

            if (level === 1) {
                //This is the first call
                this.clearRenderedMessages();
            }

            //console.log("sibblings",sibblings.length);
            //This actually replaces the for loop for sibblings -benoitg - I wrote it, but can't remember why...
            /* This recursively pops untill a valid model is found, and returns false if not */
            var popFirstValidFromSibblings = function (sibblings) {
                var model = sibblings.shift();
                var current_message_info;
                if (model) {
                    current_message_info =
                        visitorData.visitorViewData[model.getId()];
                } else {
                    //array was empty
                    return undefined;
                }

                //Only process if message is within requested offsets
                if (_.contains(messageIdsToShow, model.id)) {
                    return model;
                } else {
                    if (debug) {
                        console.log(
                            "popFirstValidFromSibblings() discarding message " +
                                model.getId() +
                                " at offset " +
                                current_message_info["traversal_order"]
                        );
                    }

                    return popFirstValidFromSibblings(sibblings);
                }
            };
            messageStructureModel = popFirstValidFromSibblings(sibblings);

            if (!messageStructureModel) {
                if (debug) {
                    console.log(
                        "getRenderedMessagesThreadedPromise() sibblings is now empty, returning."
                    );
                }

                return Promise.resolve([]);
            }

            current_message_info =
                visitorData.visitorViewData[messageStructureModel.getId()];
            if (debug) {
                console.log(
                    "getRenderedMessagesThreadedPromise() processing message: ",
                    messageStructureModel.id,
                    " at offset",
                    current_message_info["traversal_order"],
                    "with",
                    _.size(current_message_info["children"]),
                    "children"
                );
            }

            if (current_message_info["last_sibling_chain"] === undefined) {
                current_message_info[
                    "last_sibling_chain"
                ] = buildLastSibblingChain(
                    messageStructureModel,
                    visitorData.visitorViewData
                );
            }

            last_sibling_chain = current_message_info["last_sibling_chain"];

            //console.log(last_sibling_chain);

            children = _.clone(current_message_info["children"]);

            //Process children, if any
            if (_.size(children) > 0) {
                var subviews_promise = this.getRenderedMessagesThreadedPromise(
                    children,
                    level + 1,
                    visitorData,
                    messageIdsToShow
                );
            } else {
                var subviews_promise = [];
            }

            //Process sibblings, if any (this is for-loop rewritten as recursive calls to avoid locking the browser)
            if (sibblings.length > 0) {
                var sibblingsviews_promise = this.getRenderedMessagesThreadedPromise(
                    sibblings,
                    level,
                    visitorData,
                    messageIdsToShow
                );
            } else {
                var sibblingsviews_promise = [];
            }

            return Promise.join(
                subviews_promise,
                sibblingsviews_promise,
                function (subviews, sibblingsviews) {
                    view = new MessageFamilyView({
                        model: messageStructureModel,
                        messageListView: that,
                        currentLevel: level,
                        hasChildren: subviews,
                        last_sibling_chain: last_sibling_chain,
                        visitorData: visitorData,
                    });

                    // pass logic to the init view
                    //view.currentLevel = level;
                    //Note:  benoitg: We could put a setTimeout here, but apparently the promise is enough to unlock the browser
                    //view.hasChildren = (subviews.length > 0);
                    that._renderedMessageFamilyViews.push(view);
                    list.push(view);

                    //view.$('.messagelist-children').append(subviews);  moved to messageFamily

                    /* TODO:  benoitg:  We need good handling when we skip a grandparent, but I haven't ported this code yet.
                     * We should also handle the case where 2 messages have the same parent, but the parent isn't in the set */
                    /*if (!isValid && this.hasDescendantsInFilter(model)) {
               //Generate ghost message
               var ghost_element = $('<div class="message message--skip"><div class="skipped-message"></div><div class="messagelist-children"></div></div>');
               console.log("Invalid message was:",model);
               list.push(ghost_element);
               children = model.getChildren();
               ghost_element.find('.messagelist-children').append( this.getRenderedMessagesThreadedPromise(
               children, level+1, data_by_object) );
               }
       */
                    if (sibblingsviews.length > 0) {
                        list = list.concat(sibblingsviews);
                    }
                    if (debug) {
                        console.log(
                            "getRenderedMessagesThreadedPromise():  Resolving promise with:",
                            list
                        );
                    }
                    return Promise.resolve(list);
                }
            );
        }

        /**
         * Inits the annotator instance
         */
        initAnnotator() {
            var that = this;

            this.destroyAnnotator();

            //console.log("initAnnotator called");
            // Saving the annotator reference
            this.annotator = this.ui.messageList
                .annotator(this.annotator_config)
                .data("annotator");
            if (!this.annotator) {
                // e.g. empty message list
                return;
            }

            /*
      The actual initalization of annotator is based on each message's individual
      event handling of mousedown, mousemove and other's on the div element with class
      .js_messageBodyAnnotatorSelectionAllowed
     */

            // TODO: Re-render message in messagelist if an annotation was added...
            this.annotator.subscribe("annotationCreated", function (
                annotation
            ) {
                var collectionManager = new CollectionManager();
                collectionManager
                    .getAllExtractsCollectionPromise()
                    .then(function (allExtractsCollection) {
                        var segment = allExtractsCollection.addAnnotationAsExtract(
                            annotation,
                            Ctx.currentAnnotationIdIdea
                        );
                        if (!segment.isValid()) {
                            that.annotator.deleteAnnotation(annotation);
                        } else if (Ctx.currentAnnotationNewIdeaParentIdea) {
                            //We asked to create a new idea from segment
                            console.log(
                                "FIXME:  What's the proper behaviour here now that groups are separated?  " +
                                    "We should probably find out if the group is the same as the origin, and lock ONLY in that case"
                            );
                            that.getPanelWrapper().autoLockPanel();

                            Ctx.currentAnnotationNewIdeaParentIdea
                                .addSegmentAsChild(segment)
                                .then((newIdea) => {
                                    that.getContainingGroup().setCurrentIdea(
                                        newIdea
                                    );
                                });
                        } else {
                            segment.save(null, {
                                success(model, resp) {
                                    that.trigger(
                                        "annotator:success",
                                        that.annotator
                                    );
                                },
                                error(model, resp) {
                                    console.error("ERROR: initAnnotator", resp);
                                },
                            });
                        }

                        Ctx.currentAnnotationNewIdeaParentIdea = null;
                        Ctx.currentAnnotationIdIdea = null;
                    });
            });

            this.annotator.subscribe("annotationEditorShown", function (
                annotatorEditor,
                annotation
            ) {
                $(document.body).append(annotatorEditor.element);
                var save = $(annotatorEditor.element).find(".annotator-save");
                save.text(i18n.gettext("Send to clipboard"));
                var cancel = $(annotatorEditor.element).find(
                    ".annotator-cancel"
                );
                cancel.text(i18n.gettext("Cancel"));
                var textarea = annotatorEditor.fields[0].element.firstChild;
                var div = $("<div/>");
                var div_draggable = $("<div/>", {
                    draggable: true,
                    class: "annotator-textarea",
                });
                var div_annotator_help = i18n.sprintf(
                    "<div class='annotator-draganddrop-help'>%s</div>",
                    i18n.gettext(
                        "You can drag the segment below directly to the table of ideas"
                    )
                );
                var div_copy_paste = i18n.sprintf(
                    "<div class='annotator-draganddrop-help'>%s</div><div class='annotator-copy-paste-zone'>%s</div>",
                    i18n.gettext(
                        "You can also copy-paste from the text in the zone below"
                    ),
                    annotation.quote
                );

                div_draggable.html(annotation.quote);

                div_draggable.on("dragstart", function (ev) {
                    Ctx.showDragbox(ev, annotation.quote, true);
                    Ctx.setDraggedAnnotation(annotation, annotatorEditor);
                });

                div_draggable.on("dragend", function (ev) {
                    Ctx.setDraggedAnnotation(null, annotatorEditor);
                });
                div.append(div_annotator_help);
                div.append(div_draggable);
                div.append(div_copy_paste);

                $(textarea).replaceWith(div);

                //Because the MessageView will need it
                that.annotatorEditor = annotatorEditor;
            });

            this.annotator.subscribe("annotationViewerTextField", function (
                field,
                annotation
            ) {
                var collectionManager = new CollectionManager();

                var id = annotation["@id"];
                if (id === undefined) {
                    // this happens when the user has just released the mouse button after having selected text (the extract has not been created yet: the user has not clicked on the "Add to clipboard" button, nor has he dragged the selection to an idea).
                    // console.log("Missing @id, probably a new annotation", annotation);
                    // Instead of showing a bubble with "No comment" text in it, we remove the bubble
                    $(field).parents(".annotator-outer").remove();
                    return;
                }

                //$(field).html("THIS IS A TEST");
                //console.log(annotation);
                Promise.join(
                    collectionManager.getAllExtractsCollectionPromise(),
                    collectionManager.getUserLanguagePreferencesPromise(Ctx),
                    function (extracts, langPrefs) {
                        const extract = extracts.get(id);
                        const numIdeas = extract.getNumLinkedIdeas();
                        if (numIdeas == 0) {
                            const txt = i18n.gettext(
                                "This extract is in a harvester's clipboard and hasn't been sorted yet."
                            );
                            setTimeout(function () {
                                $(field).html(txt);
                            }, 100);
                        } else {
                            extract
                                .getLatestAssociatedIdeaPromise()
                                .then((idea) => {
                                    const title = idea.getShortTitleDisplayText(
                                        langPrefs
                                    );
                                    let txt;
                                    if (numIdeas == 1)
                                        txt = i18n.sprintf(
                                            i18n.gettext(
                                                'This extract was organized in the idea " %s " by the facilitator of the debate'
                                            ),
                                            title
                                        );
                                    else
                                        txt = i18n.sprintf(
                                            i18n.gettext(
                                                'This extract was organized in %d ideas, most lately " %s ", by the facilitator of the debate'
                                            ),
                                            numIdeas, title
                                        );
                                    setTimeout(function () {
                                        $(field).html(txt);
                                    }, 100);
                                });
                        }
                    }
                );
            });

            //FIXME: I do not why but between the init and when the annotation is shown there is a duplicate DOM created
            this.annotator.subscribe("annotationViewerShown", function (
                viewer,
                annotation
            ) {
                var controls = $(viewer.element).find(".annotator-controls");
                controls.hide();

                var annotationItem = $(viewer.element).find(".annotator-item");

                // Delete the duplicate DOM
                annotationItem.each(function (index) {
                    if (index > 0) $(this).remove();
                });

                // We do not need the annotator's tooltip
                //viewer.hide();
            });

            // We need extra time for annotator to be ready, but I don't
            // know why and how much.  benoitg 2014-03-10
            setTimeout(function () {
                that.trigger("annotator:initComplete", that.annotator);
            }, 10);
        }

        /**
         * destroy the current annotator instance and remove all listeners
         */
        destroyAnnotator() {
            if (!this.annotator) {
                return;
            }

            this.trigger("annotator:destroy", this.annotator);

            this.annotator.unsubscribe("annotationsLoaded");
            this.annotator.unsubscribe("annotationCreated");
            this.annotator.unsubscribe("annotationEditorShown");
            this.annotator.unsubscribe("annotationViewerShown");

            this.annotator.destroy();
            this.annotator = null;
        }

        /**
         * @event
         * Shows all messages (clears all filters)
         */
        showAllMessages() {
            //console.log("messageList:showAllMessages() called");
            this.currentQuery.clearAllFilters();
            this.render();
        }

        getTargetMessageViewStyleFromMessageListConfig(messageView) {
            var defaultMessageStyle;
            var targetMessageViewStyle;

            if (Ctx.getCurrentInterfaceType() === Ctx.InterfaceTypes.SIMPLE) {
                defaultMessageStyle =
                    Ctx.AVAILABLE_MESSAGE_VIEW_STYLES.FULL_BODY;
            } else {
                defaultMessageStyle = this.defaultMessageStyle;
            }

            if (this.currentViewStyle === this.ViewStyles.NEW_MESSAGES) {
                if (messageView.model.get("read") === true) {
                    targetMessageViewStyle =
                        Ctx.AVAILABLE_MESSAGE_VIEW_STYLES.TITLE_ONLY;
                } else {
                    if (
                        defaultMessageStyle !==
                        Ctx.AVAILABLE_MESSAGE_VIEW_STYLES.TITLE_ONLY
                    ) {
                        targetMessageViewStyle = defaultMessageStyle;
                    } else {
                        targetMessageViewStyle =
                            Ctx.AVAILABLE_MESSAGE_VIEW_STYLES.FULL_BODY;
                    }
                }
            } else {
                targetMessageViewStyle = defaultMessageStyle;
            }

            return targetMessageViewStyle;
        }

        constrainViewStyle(viewStyle) {
            if (!viewStyle) {
                //If invalid, set global default
                viewStyle = this.ViewStyles.RECENTLY_ACTIVE_THREADS;
            }
            return viewStyle;
        }

        /**
         * @event
         * Set the view to the selected viewStyle, if allowable by the current user
         * Otherwise, sets the default style
         * Does NOT re-render
         *
         */
        setViewStyle(viewStyle, DEPRECATED_skip_storage) {
            //console.log("setViewStyle called with: ", viewStyle, "interface type: ", Ctx.getCurrentInterfaceType(), "current user is unknown?:", Ctx.getCurrentUser().isUnknownUser());

            viewStyle = this.constrainViewStyle(viewStyle);

            if (this.isViewStyleThreadedType(viewStyle)) {
                this.currentViewStyle = viewStyle;
                this.currentQuery.setView(
                    this.currentQuery.availableViews.THREADED
                );
            } else if (viewStyle === this.ViewStyles.REVERSE_CHRONOLOGICAL) {
                this.currentViewStyle = viewStyle;
                this.currentQuery.setView(
                    this.currentQuery.availableViews.REVERSE_CHRONOLOGICAL
                );
            } else if (viewStyle === this.ViewStyles.CHRONOLOGICAL) {
                this.currentViewStyle = viewStyle;
                this.currentQuery.setView(
                    this.currentQuery.availableViews.CHRONOLOGICAL
                );
            } else if (viewStyle === this.ViewStyles.POPULARITY) {
                this.currentViewStyle = viewStyle;
                this.currentQuery.setView(
                    this.currentQuery.availableViews.POPULARITY
                );
            } else {
                /*else if (viewStyle === this.ViewStyles.CHRONOLOGICAL) {
        this.currentViewStyle = viewStyle;
        this.currentQuery.setView(this.currentQuery.availableViews.CHRONOLOGICAL);
      }*/
                throw new Error("Unsupported view style");
            }

            if (
                !DEPRECATED_skip_storage &&
                this.storedMessageListConfig.viewStyleId != viewStyle.id
            ) {
                this.storedMessageListConfig.viewStyleId = viewStyle.id;
                Ctx.DEPRECATEDsetMessageListConfigToStorage(
                    this.storedMessageListConfig
                );
            }
            if (this.currentQuery.isQueryValid()) {
                this.currentQuery.invalidateResults();
                this._cachedVisitorDataPromise = undefined;
                this.showMessages({ _offsetStart: 0 }).then(() => {
                    this.render();
                });
            }
            //console.log("setViewStyle finished, currentViewStyle:", this.currentViewStyle, "stored viewStyleId: ", this.storedMessageListConfig.viewStyleId);
        }

        onSetIndividualMessageViewStyleForMessageListViewStyle(
            messageViewStyle
        ) {
            //console.log("messageList::onSetIndividualMessageViewStyleForMessageListViewStyle()");
            this.setIndividualMessageViewStyleForMessageListViewStyle(
                messageViewStyle
            );
        }

        /**
         * @event
         * Set the default messageView, re-renders messages if the view doesn't match
         * @param messageViewStyle: (ex:  preview, title only, etc.)
         */
        setIndividualMessageViewStyleForMessageListViewStyle(messageViewStyle) {
            // ex: Chronological, Threaded, etc.
            var that = this;

            _.each(this.renderedMessageViewsCurrent, function (messageView) {
                var targetMessageViewStyle = that.getTargetMessageViewStyleFromMessageListConfig(
                    messageView
                );
                if (messageView.viewStyle !== targetMessageViewStyle) {
                    messageView.setViewStyle(targetMessageViewStyle);
                    messageView.render();
                }
            });

            if (
                this.storedMessageListConfig.messageStyleId !=
                messageViewStyle.id
            ) {
                this.storedMessageListConfig.messageStyleId =
                    messageViewStyle.id;
                Ctx.DEPRECATEDsetMessageListConfigToStorage(
                    this.storedMessageListConfig
                );
            }
        }

        /** Returns a list of message id in order of traversal.
         * Return -1 if message not found */
        getResultThreadedTraversalOrder(
            messageId,
            visitorOrderLookupTable,
            resultMessageIdCollection
        ) {
            var that = this;
            var retval = -1;
            _.every(visitorOrderLookupTable, function (visitorMessageId) {
                if (
                    that.isMessageIdInResults(
                        visitorMessageId,
                        resultMessageIdCollection
                    )
                ) {
                    retval++;
                }

                if (messageId === visitorMessageId) {
                    //Break the loop
                    return false;
                } else {
                    return true;
                }
            });
            return retval;
        }
        /** Return the message offset in the current view, in the set of filtered
         * messages
         * @param {string} messageId
         * @returns {Integer} callback: The message offest if message is found
         */
        getMessageOffset(messageId, visitorData, resultMessageIdCollection) {
            var messageOffset;
            if (this.isCurrentViewStyleThreadedType()) {
                try {
                    if (!visitorData.visitorViewData[messageId]) {
                        throw new Error("visitor data for message is missing");
                    }

                    if (visitorData.visitorOrderLookupTable === undefined) {
                        throw new Error(
                            "visitorOrderLookupTable message is missing"
                        );
                    }

                    if (resultMessageIdCollection === undefined) {
                        throw new Error("resultMessageIdCollection is missing");
                    }
                } catch (e) {
                    if (raven_url) {
                        Sentry.withScope((scope) => {
                            scope.setExtra("messageId", messageId);
                            scope.setExtra(
                                "visitorViewData",
                                visitorData.visitorViewData
                            );
                            Sentry.captureException(e);
                        });
                    } else {
                        throw e;
                    }
                }

                messageOffset = this.getResultThreadedTraversalOrder(
                    messageId,
                    visitorData.visitorOrderLookupTable,
                    resultMessageIdCollection
                );
            } else {
                messageOffset = resultMessageIdCollection.indexOf(messageId);
            }

            //console.log("getMessageOffset returning", messageOffset, " for message id", messageId);
            return messageOffset;
        }

        /**
         * Is the message currently onscreen (in the set of filtered messages
         * AND between the offsets onscreen.
         * This does NOT mean it's view has already finished rendering,
         * nor that it's vithin the current scroll viewport
         * @param {string} id
         * @return{boolean} true or false
         */
        isMessageInView(resultMessageIdCollection, visitorData, id) {
            //console.log("isMessageInView called for ", id, "Offsets are:", this._offsetStart, this._offsetEnd)
            if (
                this._offsetStart === undefined ||
                this._offsetEnd === undefined
            ) {
                //console.log("The messagelist hasn't displayed any messages yet");
                return false;
            }

            var messagesOnScreenIds = this.getMessageIdsToShow(
                resultMessageIdCollection,
                visitorData,
                {
                    offsetStart: this._offsetStart,
                    offsetEnd: this._offsetEnd,
                }
            );

            return _.contains(messagesOnScreenIds, id);
        }

        /**
         * @return:  A list of jquery selectors
         */
        getOnScreenMessagesSelectors(resultMessageIdCollection, visitorData) {
            if (
                this._offsetStart === undefined ||
                this._offsetEnd === undefined
            ) {
                throw new Error(
                    "The messagelist hasn't displayed any messages yet"
                );
            }

            var that = this;

            var messagesOnScreenIds = this.getMessageIdsToShow(
                resultMessageIdCollection,
                visitorData,
                {
                    offsetStart: this._offsetStart,
                    offsetEnd: this._offsetEnd,
                }
            );

            var messagesOnScreenJquerySelectors = [];

            _.each(messagesOnScreenIds, function (messageId) {
                var selector = that.getMessageSelector(messageId);
                messagesOnScreenJquerySelectors.push(selector);
            });
            return messagesOnScreenJquerySelectors;
        }

        /**
         * Get a jquery selector for a specific message id
         */
        getMessageSelector(messageId) {
            var selector = Ctx.format('[id="message-{0}"]', messageId);
            return this.$(selector);
        }

        /** scrolls to a specific message, retrying untill relevent renders
         * are complete
         */
        scrollToMessage(
            messageModel,
            shouldHighlightMessageSelected,
            shouldOpenMessageSelected,
            callback,
            failedCallback,
            recursionDepth,
            originalRenderId
        ) {
            var that = this;

            var //Stop after ~30 seconds
                MAX_RETRIES = 50;

            var debug = false;

            if (debug) {
                console.log(
                    "scrollToMessage called with args:",
                    messageModel.id,
                    shouldHighlightMessageSelected,
                    shouldOpenMessageSelected,
                    callback,
                    failedCallback,
                    recursionDepth,
                    originalRenderId
                );
            }

            recursionDepth = recursionDepth || 0;
            originalRenderId = originalRenderId || _.clone(this._renderId);
            var RETRY_INTERVAL = Math.floor(200 * Math.log(2 + recursionDepth)); // increasing interval

            shouldHighlightMessageSelected =
                typeof shouldHighlightMessageSelected === "undefined"
                    ? true
                    : shouldHighlightMessageSelected;
            shouldOpenMessageSelected =
                typeof shouldOpenMessageSelected === "undefined"
                    ? true
                    : shouldOpenMessageSelected;

            if (!messageModel) {
                throw new Error(
                    "scrollToMessage(): ERROR:  messageModel wasn't provided"
                );
            }

            if (recursionDepth === 0 && this._scrollToMessageInProgressId) {
                Sentry.withScope((scope) => {
                    scope.setExtra("messageId", messageModel.id);
                    Sentry.captureMessage(
                        "scrollToMessage():  a scrollToMessage was already in progress, aborting"
                    );
                });
                if (_.isFunction(failedCallback)) {
                    failedCallback();
                }

                return;
            } else if (originalRenderId !== this._renderId) {
                //This is a normal condition now
                //console.log("scrollToMessage():  obsolete render, aborting for ", messageModel.id);
                //Sentry.captureMessage("scrollToMessage():  obsolete render, aborting", {message_id: messageModel.id})
                if (this._scrollToMessageInProgressId === originalRenderId) {
                    this._scrollToMessageInProgressId = false;
                }

                if (_.isFunction(failedCallback)) {
                    failedCallback();
                }

                return;
            } else {
                this._scrollToMessageInProgressId = originalRenderId;
            }

            var animate_message = function (message) {
                var el = that.getMessageSelector(message.id);

                //console.log("el0: ", el);
                if (el.length && el[0]) {
                    if (shouldOpenMessageSelected) {
                        // console.log("showMessageById(): sending openWithFullBodyView
                        // to message", message.id);
                        message.trigger("openWithFullBodyView");
                        /*setTimeout(function () {
            if(debug) {
              console.log("scrollToMessage(): INFO:  shouldOpenMessageSelected is true, calling recursively after a delay with same recursion depth");
            }
            that.scrollToMessage(messageModel, shouldHighlightMessageSelected, false, callback, failedCallback, recursionDepth, originalRenderId);
          }, 1000); //Add a delay if we had to open the message*/
                    }

                    var real_callback = function () {
                        if (shouldHighlightMessageSelected) {
                            //console.log(that.currentViewStyle);
                            //console.log("el1: ", el);
                            try {
                                el.highlight();
                            } catch (e) {
                                console.log(
                                    "Error: could not highlight message. Details of the error are given below."
                                );
                                console.log(e);
                            }
                        }

                        if (_.isFunction(callback)) {
                            callback();
                        }
                    };
                    //console.log("scrollToMessage(): Scrolling to message", messageModel.id);
                    scrollUtils.scrollToElementAndWatch(el, real_callback);
                } else {
                    // Trigerring openWithFullBodyView above requires the message to
                    // re-render. We may have to give it time
                    if (recursionDepth <= MAX_RETRIES) {
                        if (debug || recursionDepth >= 2) {
                            Sentry.withScope((scope) => {
                                scope.setExtra("messageId", message.id);
                                scope.setExtra("selector", el);
                                scope.setExtra(
                                    "next_call_recursion_depth",
                                    recursionDepth + 1
                                );
                                Sentry.captureMessage(
                                    "scrollToMessage():  Message still not found in the DOM, calling recursively"
                                );
                            });
                            console.log(
                                "scrollToMessage():  Message " +
                                    message.id +
                                    " not found in the DOM with selector: ",
                                el,
                                ", calling recursively with ",
                                recursionDepth + 1
                            );
                        }

                        setTimeout(function () {
                            that.scrollToMessage(
                                messageModel,
                                shouldHighlightMessageSelected,
                                shouldOpenMessageSelected,
                                callback,
                                failedCallback,
                                recursionDepth + 1,
                                originalRenderId
                            );
                        }, RETRY_INTERVAL);
                    } else {
                        that._scrollToMessageInProgressId = false;
                        Sentry.withScope((scope) => {
                            scope.setExtra("messageId", messageModel.id);
                            scope.setExtra("recursionDepth", recursionDepth);
                            Sentry.captureMessage(
                                "scrollToMessage():  scrollToMessage(): MAX_RETRIES has been reached"
                            );
                        });
                        if (_.isFunction(failedCallback)) {
                            failedCallback();
                        }
                        return;
                    }
                }
            };

            if (this.renderIsComplete) {
                animate_message(messageModel);
                this._scrollToMessageInProgressId = false;
            } else {
                if (debug) {
                    console.log(
                        "scrollToMessage(): waiting for render to complete"
                    );
                }

                this.listenToOnce(
                    this,
                    "messageList:render_complete",
                    function () {
                        if (debug) {
                            console.log(
                                "scrollToMessage(): render has completed, animating"
                            );
                        }

                        animate_message(messageModel);
                        this._scrollToMessageInProgressId = false;
                    }
                );
            }
        }

        /**
         * Highlights the message by the given id
         * @param {string} id
         * @param {Function} [callback] Optional: The callback function to call if message is found
         * @param {boolean} shouldHighlightMessageSelected: defaults to true
         */
        showMessageById(
            id,
            callback,
            shouldHighlightMessageSelected,
            shouldOpenMessageSelected,
            shouldRecurseMaxMoreTimes,
            originalRenderId
        ) {
            var that = this;
            var collectionManager = new CollectionManager();
            var shouldRecurse;
            var debug = false;

            originalRenderId = originalRenderId || _.clone(this._renderId);

            if (debug) {
                console.log(
                    "showMessageById called with args:",
                    id,
                    callback,
                    shouldHighlightMessageSelected,
                    shouldOpenMessageSelected,
                    shouldRecurseMaxMoreTimes,
                    originalRenderId,
                    "currently on render id: ",
                    this._renderId
                );
                console.log(
                    "this.showMessageByIdInProgress:",
                    this.showMessageByIdInProgress
                );
            }

            if (!id) {
                throw new Error("showMessageById called with an empty id");
            }

            if (
                this.showMessageByIdInProgress === true &&
                shouldRecurseMaxMoreTimes === undefined
            ) {
                this.showMessageByIdInProgress = false;
                Sentry.withScope((scope) => {
                    scope.setExtra("messageId", id);
                    throw new Error(
                        "showMessageById():   a showMessageById was already in progress, aborting"
                    );
                });
            }

            if (shouldRecurseMaxMoreTimes === undefined) {
                this.showMessageByIdInProgress = true;
            }

            shouldRecurseMaxMoreTimes =
                typeof shouldRecurseMaxMoreTimes === "undefined"
                    ? 3
                    : shouldRecurseMaxMoreTimes;
            shouldRecurse = shouldRecurseMaxMoreTimes > 0;

            if (!this.currentQuery.isQueryValid()) {
                //It may be that we had no query before
                this.currentQuery.initialize();
                if (debug) {
                    console.log(
                        "Calling render manually after initializing query"
                    );
                }

                this.render();
            }

            if (!this.renderIsComplete) {
                // If there is already a render in progress, really weird things
                // can happen.  Wait untill things calm down.
                if (debug) {
                    console.log(
                        "showMessageById(): Render is in progress, setting up listener"
                    );
                }

                this.listenToOnce(
                    that,
                    "messageList:render_complete",
                    function () {
                        if (debug) {
                            console.log(
                                "showMessageById(): calling recursively after waiting for render to complete"
                            );
                        }

                        that.showMessageById(
                            id,
                            callback,
                            shouldHighlightMessageSelected,
                            shouldOpenMessageSelected,
                            shouldRecurseMaxMoreTimes - 1,
                            originalRenderId
                        );
                    }
                );
                return;
            }

            Promise.join(
                this.currentQuery.getResultMessageStructureCollectionPromise(),
                this.getVisitorDataPromise(),
                this.currentQuery.getResultMessageIdCollectionPromise(),
                function (
                    allMessageStructureCollection,
                    visitorData,
                    resultMessageIdCollection
                ) {
                    var message = allMessageStructureCollection.get(id);
                    var messageIsInFilter = that.isMessageIdInResults(
                        id,
                        resultMessageIdCollection
                    );
                    var requestedOffsets;

                    if (originalRenderId !== that._renderId) {
                        Sentry.withScope((scope) => {
                            scope.setExtra("messageId", id);
                            Sentry.captureMessage(
                                "showMessageById():  Unable to complete because a new render is in progress, restarting from scratch"
                            );
                        });
                        that.showMessageByIdInProgress = false;
                        that.showMessageById(
                            id,
                            callback,
                            shouldHighlightMessageSelected,
                            shouldOpenMessageSelected,
                            undefined,
                            undefined
                        );
                        return;
                    }

                    if (
                        messageIsInFilter &&
                        !that.isMessageInView(
                            resultMessageIdCollection,
                            visitorData,
                            id
                        )
                    ) {
                        if (shouldRecurse) {
                            var success = function () {
                                if (debug) {
                                    console.log(
                                        "showMessageById(): INFO: message " +
                                            id +
                                            " was in query results but not onscreen, we requested a page change and now call showMessageById() recursively after waiting for render to complete"
                                    );
                                }

                                that.showMessageById(
                                    id,
                                    callback,
                                    shouldHighlightMessageSelected,
                                    shouldOpenMessageSelected,
                                    0,
                                    originalRenderId
                                );
                            };
                            requestedOffsets = that.calculateRequestedOffsetToShowMessage(
                                id,
                                visitorData,
                                resultMessageIdCollection
                            );
                            that.requestMessages(requestedOffsets); //It may be that a render in progress that will actually use it
                            if (debug) {
                                console.log(
                                    "showMessageById() requesting page change with requestedOffset:",
                                    requestedOffsets
                                );
                            }

                            that.listenToOnce(
                                that,
                                "messageList:render_complete",
                                success
                            );
                            that.showMessages(requestedOffsets);
                        } else {
                            that.showMessageByIdInProgress = false;
                            Sentry.withScope((scope) => {
                                scope.setExtra("messageId", id);
                                throw new Error(
                                    "showMessageById():  Message is in query results but not in current page, and we are not allowed to recurse"
                                );
                            });
                        }

                        return true;
                    }

                    if (!messageIsInFilter) {
                        //The current filters might not include the message
                        if (shouldRecurse) {
                            that.showAllMessages();
                            var success = function () {
                                console.log(
                                    "showMessageById(): WARNING: message " +
                                        id +
                                        " not in query results, calling showMessageById() recursively after clearing filters"
                                );
                                that.showMessageById(
                                    id,
                                    callback,
                                    shouldHighlightMessageSelected,
                                    shouldOpenMessageSelected,
                                    shouldRecurseMaxMoreTimes - 1,
                                    originalRenderId
                                );
                            };
                            that.listenToOnce(
                                that,
                                "messageList:render_complete",
                                success
                            );
                        } else {
                            console.log(
                                "Message not in colllection:  id collection was: ",
                                resultMessageIdCollection
                            );
                            that.showMessageByIdInProgress = false;
                            Sentry.withScope((scope) => {
                                scope.setExtra("messageId", id);
                                throw new Error(
                                    "showMessageById:  Message is not in query results, and we are not allowed to recurse"
                                );
                            });
                        }

                        return true;
                    }

                    var real_callback = function () {
                        if (_.isFunction(callback)) {
                            callback();
                        }
                    };

                    if (debug) {
                        console.log(
                            "showMessageById: Handing off to scrollToMessage"
                        );
                    }
                    that.scrollToMessage(
                        message,
                        shouldHighlightMessageSelected,
                        shouldOpenMessageSelected,
                        real_callback
                    );
                    that.showMessageByIdInProgress = false;
                }
            ).error(function () {
                // give up. This was actually seen.
                console.error("showMessageById: promises failed.");
                that.showMessageByIdInProgress = false;
            });
        }

        scrollToTopPostBox() {
            //console.log(scrollToTopPostBox());
            scrollUtils.scrollToElementAndWatch(
                this.$(".messagelist-replybox")
            );
            if (Ctx.debugRender) {
                console.log(
                    "MessageList:scrollToTopPostBox() stealing browser focus"
                );
            }
            this.$(".messageSend-subject").focus();
        }

        getCurrentViewPortTop() {
            return this.ui.panelBody.offset().top;
        }

        getCurrentViewPortBottom() {
            let height =
                this.getCurrentViewPortTop() + this.ui.panelBody.height();
            let stickyBarHeight = this.ui.stickyBar.height();
            if (stickyBarHeight) {
                height = height - stickyBarHeight;
            }
            return height;
        }

        /**
         * Shows the number of pending messages added through the socket
         * @function app.views.messageList.MessageList.showPendingMessages
         *
         * @param      {number}  nbMessage  The number of new messages
         */
        showPendingMessages(nbMessage) {
            this._originalDocumentTitle = document.querySelector(
                "#discussion-topic"
            ).value;
            document.title =
                " (" + nbMessage + ") " + this._originalDocumentTitle;

            var msg = i18n.sprintf(
                i18n.ngettext(
                    "%d new message has been posted.  Click here to refresh",
                    "%d new messages have been posted.  Click here to refresh",
                    nbMessage
                ),
                nbMessage
            );

            if (nbMessage > 0) {
                this.ui.pendingMessage.html(msg);
                this.ui.contentPending.removeClass("hidden").slideDown("slow");
            }
        }

        resetPendingMessages(allMessageStructureCollection) {
            this.nbPendingMessage = 0;
            this._initialLenAllMessageStructureCollection =
                allMessageStructureCollection.length;
            if (this._originalDocumentTitle) {
                document.title = this._originalDocumentTitle;
            }
        }

        addPendingMessage(message, messageCollection) {
            this.nbPendingMessage += 1;
            this.showPendingMessages(this.nbPendingMessage);
        }

        /**
         * @returns A promise
         */
        loadPendingMessages() {
            var that = this;
            var collectionManager = new CollectionManager();
            return collectionManager
                .getAllMessageStructureCollectionPromise()
                .then(function (allMessageStructureCollection) {
                    that.resetPendingMessages(allMessageStructureCollection);
                    that.invalidateQuery();
                    that.render();
                });
        }

        invalidateQuery() {
            this.currentQuery.invalidateResults();
        }

        resetScrollLogger() {
            let that = this;
            if (this.scrollLogger) {
                this.scrollLogger.finalize();
            }
            this.scrollLogger = new ScrollLogger(that);
        }

        /**
         * Processes the scroll events to ultimately generate message reading
         * analytics
         *
         * WARNING, this is a jquery handler, NOT a backbone one
         *
         * @event
         * @param ev: The jquery event, with the view as ev.data
         */
        logScroll_base(ev) {
            if (!ev.data) {
                //this isn't our own scroll handler
                return;
            }
            let that = ev.data;
            let currentScrollTop = that.ui.panelBody.scrollTop();
            let d = new Date();
            let currentTimeStamp = d.getTime();

            that.scrollLogger.scrollEventStack.push({
                timeStamp: currentTimeStamp,
                scrollTop: currentScrollTop,
            });
            Promise.join(
                that.currentQuery.getResultMessageIdCollectionPromise(),
                that.getVisitorDataPromise(),
                function (resultMessageIdCollection, visitorData) {
                    if (!that.isDestroyed()) {
                        that.scrollLogger.processScrollEventStack(
                            resultMessageIdCollection,
                            visitorData
                        );
                    }
                }
            );
        }
    }

    return BaseMessageListMixin;
}

export default BaseMessageListMixinFactory;
