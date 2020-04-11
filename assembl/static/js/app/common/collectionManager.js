/**
 * A singleton to manage data backend access with Ajax requests and Bluebird promises. Responsible for the data synchronization listening to a websocket and updating collections.
 * @module app.common.collectionManager
 */

import Marionette from "backbone.marionette";
import * as Sentry from "@sentry/browser";

import Promise from "bluebird";
import $ from "jquery";
import IdeaLoom from "../app.js";
import Ctx from "./context.js";
import Message from "../models/message.js";
import groupSpec from "../models/groupSpec.js";
import Idea from "../models/idea.js";
import IdeaLink from "../models/ideaLink.js";
import Segment from "../models/segment.js";
import Synthesis from "../models/synthesis.js";
import Partners from "../models/partners.js";
import TimelineEvent from "../models/timeline.js";
import Announcement from "../models/announcement.js";
import Agents from "../models/agents.js";
import NotificationSubscription from "../models/notificationSubscription.js";
import Storage from "../objects/storage.js";
import Types from "../utils/types.js";
import i18n from "../utils/i18n.js";
import RoleModels from "../models/roles.js";
import Discussion from "../models/discussion.js";
import DiscussionSource from "../models/discussionSource.js";
import Widget from "../models/widget.js";
import Social from "../models/social.js";
import Account from "../models/accounts.js";
import Socket from "../utils/socket.js";
import DiscussionSources from "../models/sources.js";
import DiscussionPreference from "../models/discussionPreference.js";
import LanguagePreference from "../models/languagePreference.js";
import IdeaContentLink from "../models/ideaContentLink.js";
import PublicationFlow from "../models/publicationFlow.js";

/**
 * A singleton to manage lazy loading of server collections
 * @class app.common.collectionManager.CollectionManager
 */
class CollectionManager extends Marionette.Object.extend({
    channelName: "socket",

    radioEvents: {
        "socket:open": "refetchAllMessageStructureCollection",
    },

    radioRequests: {
        "ideas:update": "ideasCollectionUpdateHandler",
    },

    FETCH_WORKERS_LIFETIME: 30,

    /**
     * Send debugging output to console.log to observe the activity of lazy
     * loading
     *
     * @type {boolean}
     */
    DEBUG_LAZY_LOADING: false,

    /**
     * Collection with all users in the discussion.
     *
     * @type {UserCollection}
     */
    _allUsersCollection: undefined,

    _allUsersCollectionPromise: undefined,

    /**
     * Collection with all messsages in the discussion.
     *
     * @type {MessageCollection}
     */
    _allMessageStructureCollection: undefined,

    _allMessageStructureCollectionPromise: undefined,

    /**
     * Collection with all synthesis in the discussion.
     *
     * @type {SynthesisCollection}
     */
    _allSynthesisCollection: undefined,

    _allSynthesisCollectionPromise: undefined,

    /**
     * Collection with all ideas in the discussion.
     *
     * @type {SegmentCollection}
     */
    _allIdeasCollection: undefined,

    _allIdeasCollectionPromise: undefined,

    /**
     * Collection with all idea links in the discussion.
     *
     * @type {MessageCollection}
     */
    _allIdeaLinksCollection: undefined,

    _allIdeaLinksCollectionPromise: undefined,

    /**
     * Collection with all extracts in the discussion.
     *
     * @type {SegmentCollection}
     */
    _allExtractsCollection: undefined,

    _allExtractsCollectionPromise: undefined,

    /**
     * Collection with a definition of the user's view
     *
     * @type {GroupSpec}
     */
    _allGroupSpecsCollection: undefined,

    _allGroupSpecsCollectionPromise: undefined,

    /**
     * Collection with all partner organization in the discussion.
     *
     * @type {PartnerOrganizationCollection}
     */
    _allPartnerOrganizationCollection: undefined,

    _allPartnerOrganizationCollectionPromise: undefined,

    /**
     * Collection with all timeline events in the discussion.
     *
     * @type {TimelineEventCollection}
     */
    _allTimelineEventCollection: undefined,

    _allTimelineEventCollectionPromise: undefined,

    /**
     * Collection with idea announcments for the messageList.
     */
    _allAnnouncementCollection: undefined,

    _allAnnouncementCollectionPromise: undefined,

    /**
     * Collection from discussion notifications.
     */
    _allNotificationsDiscussionCollection: undefined,

    _allNotificationsDiscussionCollectionPromise: undefined,

    /**
     * Collection from user notifications
     */
    _allNotificationsUserCollection: undefined,

    _allNotificationsUserCollectionPromise: undefined,

    /**
     * Collection of all possible user roles
     */
    _allLocalRoleCollection: undefined,

    _allLocalRoleCollectionPromise: undefined,

    /**
     * Collection of roles for the current user
     */
    _myLocalRoleCollection: undefined,

    _myLocalRoleCollectionPromise: undefined,

    /**
     * Collection of publication states
     */
    _allIdeaPublicationStates: undefined,

    _allIdeaPublicationStatesPromise: undefined,

    /**
     * Collection of local permissions (acls)
     */
    _allDiscussionAcls: undefined,

    _allDiscussionAclsPromise: undefined,

    /**
     * Collection of pub state-specific permissions
     */
    _allPubStatePermissions: undefined,

    _allPubStatePermissionsPromise: undefined,

    /**
     * Collection from discussion
     */
    _allDiscussionModel: undefined,

    _allDiscussionModelPromise: undefined,

    //Deprecated -> This is the old way. Will be deleted soon
    _allDiscussionSourceCollection: undefined,

    _allDiscussionSourceCollectionPromise: undefined,

    //
    _currentUserModel: undefined,

    _currentUserModelPromise: undefined,

    /**
     * Collection of Facebook Access Tokens that current user is permissible to
     * view
     */
    _allFacebookAccessTokens: undefined,

    _allFacebookAccessTokensPromise: undefined,

    /**
     * The super collection of all types of sources that the front end supports
     */
    _allDiscussionSourceCollection2: undefined,

    _allDiscussionSourceCollection2Promise: undefined,

    /**
     * Collection of all the Accounts associated with the current User
     *
     * @type {Account}
     */
    _allUserAccounts: undefined,

    _allUserAccountsPromise: undefined,

    /**
     * Collection of all the Widgets in the discussion
     *
     * @type {Widget}
     */
    _allWidgets: undefined,

    _allWidgetsPromise: undefined,

    /**
     * Collection of all language preferences of the user
     * @type {UserLanguagePreference}
     */
    _allUserLanguagePreferences: undefined,

    _allUserLanguagePreferencesPromise: undefined,

    /**
     * Collection of all preferences of the user
     * @type {DiscussionPreference.Model}
     */
    _allUserPreferences: undefined,

    _allUserPreferencesPromise: undefined,

    /**
     * Collection of all preferences of the discussion
     * @type {DiscussionPreference.Model}
     */
    _allDiscussionPreferences: undefined,

    _allDiscussionPreferencesPromise: undefined,

    /**
     * Collection of all preferences of the system
     * @type {DiscussionPreference.Model}
     */
    _globalPreferences: undefined,

    _globalPreferencesPromise: undefined,

    /**
     * The PublicationFlow of ideas in the current discussion
     * @type {publicationFlow.publicationFlowModel}
     */
    _ideaPublicationFlow: undefined,

    _ideaPublicationFlowPromise: undefined,

    /**
     * Collection of all publicationFlows of the system
     * @type {DiscussionPreference.Model}
     */
    _allPublicationFlows: undefined,

    _allPublicationFlowsPromise: undefined,

    /**
     * Dictionary of Collections of each message's idea content link
     * This collection does not hit the network (2016-02-02)
     */
    _allMessageIdeaContentLinkCollectionDict: undefined,

    /**
     * Connected socket promise
     *
     * @type socket
     */
    _connectedSocketPromise: undefined,

    _waitingWorker: undefined,
    _messageFullModelRequests: {},
}) {
    /**
     * Returns the owning collection for the raw json of an object that
     * doesn't have a model yet.  Primarily used when receiving an object on
     * the websocket
     *
     * Ex: A harvester changes the title of an idea.  The updated idea will be put
     * on the websocket by the backend.  All frontends (all connected users) will
     * recieve this json.  It is fed in this function so that the corresponding
     * model in the collection can be updated (this update does NOT happen in this
     * method)
     * @param {BaseModel} item
     * @param {string} item['@type'] - The model type
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getCollectionPromiseByType
     */
    getCollectionPromiseByType(item) {
        var type = Types.getBaseType(item["@type"]);

        switch (type) {
            case Types.EXTRACT:
                return this.getAllExtractsCollectionPromise();

            case Types.IDEA:
                return this.getAllIdeasCollectionPromise();

            case Types.IDEA_LINK:
                return this.getAllIdeaLinksCollectionPromise();

            case Types.IDEA_EXTRACT_LINK:
                // special case
                return this.getAllExtractsCollectionPromise();

            case Types.POST:
                return this.getAllMessageStructureCollectionPromise();

            case Types.USER:
            case Types.AGENT_PROFILE:
                return this.getAllUsersCollectionPromise();

            case Types.SYNTHESIS:
                return this.getAllSynthesisCollectionPromise();

            case Types.PARTNER_ORGANIZATION:
                return this.getAllPartnerOrganizationCollectionPromise();

            case Types.TIMELINE_EVENT:
            case Types.DISCUSSION_PHASE:
            case Types.DISCUSSION_MILESTONE:
            case Types.DISCUSSION_SESSION:
                return this.getAllTimelineEventCollectionPromise();

            case Types.WIDGET:
                return this.getAllWidgetsPromise();
        }

        return null;
    }

    initialize(options) {}

    /**
     * Returns the collection of users and agents
     * An exception, the collection is instanciated from json sent in the HTML of the frontend, not through an ajax request.
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllUsersCollectionPromise
     */
    getAllUsersCollectionPromise() {
        if (this._allUsersCollectionPromise) {
            return this._allUsersCollectionPromise;
        }

        this._allUsersCollection = new Agents.Collection();
        this._allUsersCollection.collectionManager = this;
        this._allUsersCollectionPromise = Promise.resolve(
            this._allUsersCollection.fetchFromScriptTag("users-json")
        )
            .thenReturn(this._allUsersCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allUsersCollectionPromise;
    }

    /**
     * Returns the idea publication flow.
     * An exception, the flow is instanciated from json sent in the HTML of the frontend, not through an ajax request.
     * @returns {PublicationFlow}
     * @function app.common.collectionManager.CollectionManager.getAllUsersCollectionPromise
     */
    getIdeaPublicationFlowPromise() {
        if (this._ideaPublicationFlowPromise) {
            return this._ideaPublicationFlowPromise;
        }

        this._ideaPublicationFlow = new PublicationFlow.publicationFlowModel();
        this._ideaPublicationFlowPromise = Promise.resolve(
            this._ideaPublicationFlow.fetchFromScriptTag(
                "idea-publication-flow",
                true
            )
        )
            .thenReturn(this._ideaPublicationFlow)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._ideaPublicationFlowPromise;
    }

    /**
     * Returns the collection of message structures
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllMessageStructureCollectionPromise
     **/
    getAllMessageStructureCollectionPromise() {
        var that = this;

        if (this._allMessageStructureCollectionPromise) {
            return this._allMessageStructureCollectionPromise;
        }

        this._allMessageStructureCollection = new Message.Collection();
        this._allMessageStructureCollection.collectionManager = this;
        this._allMessageStructureCollectionPromise = Promise.resolve(
            this._allMessageStructureCollection.fetch()
        )
            .then(function () {
                return that._allMessageStructureCollection;
            })
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allMessageStructureCollectionPromise;
    }

    refetchAllMessageStructureCollection() {
        if (
            this._allMessageStructureCollectionPromise !== undefined &&
            this._allMessageStructureCollectionPromise.isFulfilled()
        ) {
            //Yes, I want that in sentry for now
            console.debug(
                "collectionManager: getAllMessageStructureCollectionPromise re-fetching because of socket re-open."
            );
            //console.log(that._allMessageStructureCollection);
            //WARNING:  This is wastefull.  But even if we had a mecanism to request only if there is new data, some specific models might have changed.
            //So the only way we could fix that is to add a generic mecanism that returns objects modified after a specific date,
            // recursively taking into account any relationship in the viewdef.  Not likely to happen...

            /* Another aspect is that ALL messages onscreen will re-fetch and re-render
      This is wastefull (CPU usage and loaders and flashing for the user),
      as in the specific case of messages it is relatively easy to get a
      reliable modification date */
            this._allMessageStructureCollection.fetch();
        }
    }

    /**
     * This class is essentially a subprocess that receives requests for specific models and a specific viewdef and:
     * - Combines them together to avoid swarming the server
     * - Splits them to respect limits on http get url length
     * - Dispaches the individual promises for each request even if they were actually processed together.
     * @param {Object} collectionManager
     * @param {Promise} messagesStructureCollectionPromise (optional) A promise containing a structure of messages (messages ids and how they are related to each other, but not necessarily their content), for which you want to download the message contents. Defaults to the general message structure collection promise (collectionManager.getAllMessageStructureCollectionPromise()), which contains all messages except deleted messages which removal does not break the structure. For example, if you want to show in the messageList the presence of all messages including all deleted messages, you need to set this parameter to a promise which contains the structure of absolutely all messages.
     * @returns {Promise}
     * @function app.common.collectionManager.CollectionManager.getMessageFullModelRequestWorker
     */
    getMessageFullModelRequestWorker(
        collectionManager,
        messagesStructureCollectionPromise
    ) {
        (this.collectionManager = collectionManager),
            (this.requests = this.collectionManager._messageFullModelRequests),
            (this.addRequest = function (id) {
                /*
                 * Emulates the defered pattern in bluebird, in this case we really do
                 * need it
                 */
                function Defer() {
                    var resolve;
                    var reject;
                    var promise = new Promise(function (...args) {
                        resolve = args[0];
                        reject = args[1];
                    });
                    return {
                        resolve: resolve,
                        reject: reject,
                        promise: promise,
                    };
                }

                var promiseResolver;
                if (this.requests[id] === undefined) {
                    promiseResolver = new Defer();
                    this.requests[id] = {
                        promiseResolver: promiseResolver,
                        serverRequestInProgress: false,
                        count: 1,
                    };
                } else {
                    promiseResolver = this.requests[id]["promiseResolver"];
                    this.requests[id]["count"]++;
                }

                if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                    console.log(
                        "Added request for id:" + id + ", now ",
                        this.requests[id]["count"],
                        " requests for this id, queue size is now:" +
                            _.size(this.requests)
                    );
                }

                // This part manages GET url lenght
                // The problem is that each of our object id can take up to ~40
                // characters.  To not exceed
                // the 2048 characters unofficial limit for GET URLs,
                // (IE and others), we only request up to do up to:
                // 2000/40 ~= 50 id's at a time
                var unservicedRequests = _.filter(this.requests, function (
                    request
                ) {
                    return request["serverRequestInProgress"] === false;
                });
                var numUnservicedRequests = _.size(unservicedRequests);
                if (numUnservicedRequests >= 50) {
                    if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                        console.log(
                            "Executing unserviced request immediately, unserviced queue size is now:",
                            numUnservicedRequests
                        );
                    }

                    //TODO:  This is suboptimal, as the server can still be hammered
                    //with concurrent requests for the same data, causing
                    //database contention.  Like the bit below, we should remember
                    //how many requests are in transit, and not have more than 3

                    //Alternatively, we could POST on a fake URL, with the url path
                    //as the body of the request and avoid this spliting completely.

                    this.executeRequest();
                }

                return promiseResolver.promise;
            }),
            (this.executeRequest = function () {
                var that = this;
                var ids = [];
                if (typeof messagesStructureCollectionPromise === "undefined") {
                    messagesStructureCollectionPromise = this.collectionManager.getAllMessageStructureCollectionPromise();
                }
                if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                    console.log(
                        "executeRequest fired, unregistering worker from collection Manager"
                    );
                }

                this.collectionManager._waitingWorker = undefined;

                _.each(that.requests, function (request, id) {
                    //var structureModel = allMessageStructureCollection.get(id);
                    if (request["serverRequestInProgress"] === false) {
                        request["serverRequestInProgress"] = true;
                        ids.push(id);
                    }
                });
                messagesStructureCollectionPromise.then(function (
                    allMessageStructureCollection
                ) {
                    var PostQuery = require("../views/messageListPostQuery")
                        .default;
                    var postQuery = new PostQuery();
                    var viewDef = "default";

                    if (_.size(ids) > 0) {
                        postQuery.addFilter(
                            postQuery.availableFilters.POST_HAS_ID_IN,
                            ids
                        );
                        postQuery.setViewDef(viewDef); //We want the full messages
                        if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                            console.log(
                                "requesting message data from server for " +
                                    _.size(ids) +
                                    " messages"
                            );
                        }

                        postQuery
                            .getResultRawDataPromise()
                            .then(function (results) {
                                _.each(results, function (jsonData) {
                                    var id = jsonData["@id"];
                                    var structureModel = allMessageStructureCollection.get(
                                        id
                                    );
                                    var deferredList = that.requests[id];

                                    if (
                                        CollectionManager.prototype
                                            .DEBUG_LAZY_LOADING
                                    ) {
                                        console.log(
                                            "executeRequest resolving for id",
                                            id,
                                            deferredList["count"],
                                            " requests queued for that id"
                                        );
                                    }

                                    structureModel.set(
                                        structureModel.parse(jsonData)
                                    );
                                    if (deferredList !== undefined) {
                                        deferredList["promiseResolver"].resolve(
                                            structureModel
                                        );
                                        delete that.requests[id];
                                    } else {
                                        console.log(
                                            "WARNING: collectionManager::executeRequest() received data for " +
                                                id +
                                                ", but there is no matching request.  Race condition?"
                                        );
                                    }
                                });
                            });
                    } else {
                        if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                            console.log(
                                "executeRequest called, but no ids to request from the server out of the list of ",
                                _.size(that.requests)
                            );
                        }
                    }
                });
            });

        //Constructor
        if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
            console.log("Spawning new _getMessageFullModelsRequestWorker");
        }

        var that = this;
        this.executeTimeout = setTimeout(function () {
            if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                console.log(
                    "Executing unserviced request immediately (timeout reached)"
                );
            }

            that.executeRequest();
        }, collectionManager.FETCH_WORKERS_LIFETIME);
    }

    /**
     * This returns a promise to a SINGLE model.
     * In practice, this model is a member of the proper collection, and requests to the server are optimised and batched together.
     * Primarily used by messages to get the actual body and other information we do not want to eagerly preload.
     * @param {String} id
     * @param {Promise} messagesStructureCollectionPromise (optional) A promise containing a structure of messages (messages ids and how they are related to each other, but not necessarily their content), for which you want to download the message contents. Defaults to the general message structure collection promise (this.getAllMessageStructureCollectionPromise()), which contains all messages except deleted messages which removal does not break the structure. For example, if you want to show in the messageList the presence of all messages including all deleted messages, you need to set this parameter to a promise which contains the structure of absolutely all messages.
     * @returns {Promise}
     * @function app.common.collectionManager.CollectionManager.getMessageFullModelPromise
     */
    getMessageFullModelPromise(id, messagesStructureCollectionPromise) {
        var that = this;
        if (typeof messagesStructureCollectionPromise === "undefined") {
            messagesStructureCollectionPromise = this.getAllMessageStructureCollectionPromise();
        }

        if (!id) {
            var msg =
                "getMessageFullModelPromise(): Tried to request full message model with a falsy id.";
            console.error(msg);
            return Promise.reject(msg);
        }

        return messagesStructureCollectionPromise.then(function (
            allMessageStructureCollection
        ) {
            var structureModel = allMessageStructureCollection.get(id);

            if (structureModel) {
                if (structureModel.get("@view") === "default") {
                    if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                        console.log("getMessageFullModelPromise CACHE HIT!");
                    }

                    return Promise.resolve(structureModel);
                } else {
                    if (CollectionManager.prototype.DEBUG_LAZY_LOADING) {
                        console.log("getMessageFullModelPromise CACHE MISS!");
                    }

                    if (that._waitingWorker === undefined) {
                        that._waitingWorker = new that.getMessageFullModelRequestWorker(
                            that,
                            messagesStructureCollectionPromise
                        );
                    }

                    return that._waitingWorker.addRequest(id);
                }
            } else {
                Sentry.captureMessage(
                    "Structure model not in allMessageStructureCollection",
                    { requested_message_id: id }
                );
                return Promise.reject(msg);
            }
        });
    }

    /**
     * TODO: This method seems to not be used anywhere in the code. Remove it or use it. If we use it, add a second parameter messagesStructureCollectionPromise like in getMessageFullModelPromise().
     * Retrieve fully populated models for the list of id's given
     * @param {string[]} ids array of message id's
     * @returns {MessageModel}
     * @function app.common.collectionManager.CollectionManager.getMessageFullModelsPromise
     */
    getMessageFullModelsPromise(ids) {
        var that = this;
        var returnedModelsPromises = [];

        _.each(ids, function (id) {
            var promise = that.getMessageFullModelPromise(id);
            returnedModelsPromises.push(promise);
        });

        return Promise.all(returnedModelsPromises)
            .then(function (models) {
                //var args = Array.prototype.slice.call(arguments);
                //console.log("getMessageFullModelsPromise() resolved promises:", returnedModelsPromises);
                //console.log("getMessageFullModelsPromise() resolving with:", args);
                return Promise.resolve(models);
            })
            .catch(function (e) {
                console.error(
                    "getMessageFullModelsPromise: One or more of the id's couldn't be retrieved: ",
                    e
                );
                return Promise.reject(e);
            });
    }

    /**
     * Returns the collection of synthesis
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllSynthesisCollectionPromise
     **/
    getAllSynthesisCollectionPromise() {
        if (this._allSynthesisCollectionPromise) {
            return this._allSynthesisCollectionPromise;
        }

        this._allSynthesisCollection = new Synthesis.Collection();
        this._allSynthesisCollection.collectionManager = this;
        this._allSynthesisCollectionPromise = Promise.resolve(
            this._allSynthesisCollection.fetch()
        )
            .thenReturn(this._allSynthesisCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allSynthesisCollectionPromise;
    }

    /**
     * Returns the collection of ideas
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllIdeasCollectionPromise
     **/
    getAllIdeasCollectionPromise() {
        var that = this;
        if (this._allIdeasCollectionPromise) {
            return this._allIdeasCollectionPromise;
        }

        this._allIdeasCollection = new Idea.Collection();
        this._allIdeasCollection.collectionManager = this;
        this._allIdeasCollectionPromise = Promise.resolve(
            this._allIdeasCollection.fetch()
        )
            .thenReturn(this._allIdeasCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allIdeasCollectionPromise;
    }

    ideasCollectionUpdateHandler(ideas) {
        if (this._allIdeasCollection !== undefined) {
            if (Ctx.debugRender) {
                console.log(
                    "ideaList: triggering render because app.on('ideas:update') was triggered"
                );
            }

            this._allIdeasCollection.add(ideas, { merge: true });
        }
    }

    /**
     * Returns the collection of idea links
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllIdeaLinksCollectionPromise
     **/
    getAllIdeaLinksCollectionPromise() {
        if (this._allIdeaLinksCollectionPromise) {
            return this._allIdeaLinksCollectionPromise;
        }

        this._allIdeaLinksCollection = new IdeaLink.Collection();
        this._allIdeaLinksCollection.collectionManager = this;
        this._allIdeaLinksCollectionPromise = Promise.resolve(
            this._allIdeaLinksCollection.fetch()
        )
            .thenReturn(this._allIdeaLinksCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allIdeaLinksCollectionPromise;
    }

    /**
     * Returns the collection of extracts
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllExtractsCollectionPromise
     **/
    getAllExtractsCollectionPromise() {
        if (this._allExtractsCollectionPromise) {
            return this._allExtractsCollectionPromise;
        }

        this._allExtractsCollection = new Segment.Collection();
        this._allExtractsCollection.collectionManager = this;
        this._allExtractsCollectionPromise = Promise.resolve(
            this._allExtractsCollection.fetchFromScriptTag(
                "extracts-json",
                true
            )
        )
            .thenReturn(this._allExtractsCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allExtractsCollectionPromise;
    }

    /**
     * Returns the collection of partners
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllPartnerOrganizationCollectionPromise
     **/
    getAllPartnerOrganizationCollectionPromise() {
        if (this._allPartnerOrganizationCollectionPromise) {
            return this._allPartnerOrganizationCollectionPromise;
        }

        this._allPartnerOrganizationCollection = new Partners.Collection();
        this._allPartnerOrganizationCollection.collectionManager = this;
        this._allPartnerOrganizationCollectionPromise = Promise.resolve(
            this._allPartnerOrganizationCollection.fetch()
        )
            .thenReturn(this._allPartnerOrganizationCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allPartnerOrganizationCollectionPromise;
    }

    /**
     * Returns the collection of partners
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllPartnerOrganizationCollectionPromise
     **/
    getAllTimelineEventCollectionPromise() {
        if (this._allTimelineEventCollectionPromise) {
            return this._allTimelineEventCollectionPromise;
        }

        this._allTimelineEventCollection = new TimelineEvent.Collection();
        this._allTimelineEventCollection.collectionManager = this;
        this._allTimelineEventCollectionPromise = Promise.resolve(
            this._allTimelineEventCollection.fetch()
        )
            .thenReturn(this._allTimelineEventCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allTimelineEventCollectionPromise;
    }

    /**
     * Returns the collection of annoucements
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllAnnouncementCollectionPromise
     **/
    getAllAnnouncementCollectionPromise() {
        if (this._allAnnouncementCollectionPromise) {
            return this._allAnnouncementCollectionPromise;
        }

        this._allAnnouncementCollection = new Announcement.Collection();
        this._allAnnouncementCollection.collectionManager = this;
        this._allAnnouncementCollectionPromise = Promise.resolve(
            this._allAnnouncementCollection.fetch()
        )
            .thenReturn(this._allAnnouncementCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allAnnouncementCollectionPromise;
    }

    /**
     * Returns the collection of discussion notifications
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getNotificationsDiscussionCollectionPromise
     **/
    getNotificationsDiscussionCollectionPromise() {
        if (this._allNotificationsDiscussionCollectionPromise) {
            return this._allNotificationsDiscussionCollectionPromise;
        }

        this._allNotificationsDiscussionCollection = new NotificationSubscription.Collection();
        this._allNotificationsDiscussionCollection.setUrlToDiscussionTemplateSubscriptions();
        this._allNotificationsDiscussionCollection.collectionManager = this;
        this._allNotificationsDiscussionCollectionPromise = Promise.resolve(
            this._allNotificationsDiscussionCollection.fetch()
        )
            .thenReturn(this._allNotificationsDiscussionCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allNotificationsDiscussionCollectionPromise;
    }

    /**
     * @param {Object} models
     * @param {Object} allIdeasCollection
     * @returns {Object} models
     * @function app.common.collectionManager.CollectionManager._parseGroupStates
     **/
    _parseGroupStates(models, allIdeasCollection) {
        var that = this;
        _.each(models, function (model) {
            _.each(model.states, function (state) {
                if (
                    state.currentIdea !== undefined &&
                    state.currentIdea !== null
                ) {
                    var currentIdeaId = state.currentIdea;
                    state.currentIdea = allIdeasCollection.get(currentIdeaId);
                }
            });
        });
        return models;
    }

    /**
     * Returns the stored configuration of groups and panels
     * @param {Object} viewsFactory
     * @param {String} url_structure_promise
     * @param {Boolean} skip_group_state
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getGroupSpecsCollectionPromise
     **/
    getGroupSpecsCollectionPromise(
        viewsFactory,
        url_structure_promise,
        skip_group_state
    ) {
        var that = this;

        if (skip_group_state === undefined) {
            // if you cannot use expert interface, you cannot recover from a mangled state.
            skip_group_state = !Ctx.canUseExpertInterface();
        }

        if (this._allGroupSpecsCollectionPromise === undefined) {
            //FIXME:  This is slow.  Investigate fetching the single idea and adding it to the collection before fetching the whole collection
            var allIdeasCollectionPromise = this.getAllIdeasCollectionPromise();
            if (url_structure_promise === undefined) {
                url_structure_promise = Promise.resolve(undefined);
            }

            return Promise.join(
                allIdeasCollectionPromise,
                url_structure_promise,
                function (allIdeasCollection, url_structure) {
                    var collection;
                    var data;
                    if (url_structure !== undefined) {
                        collection = url_structure;
                    } else if (skip_group_state === false) {
                        data = Storage.getStorageGroupItem();
                        if (data !== undefined) {
                            data = that._parseGroupStates(
                                data,
                                allIdeasCollection
                            );
                        }
                    }

                    if (data !== undefined) {
                        collection = new groupSpec.Collection(data, {
                            parse: true,
                        });
                        if (!collection.validate()) {
                            console.error(
                                "getGroupSpecsCollectionPromise(): Collection in local storage is invalid, will return a new one"
                            );
                            collection = undefined;
                        }
                    }

                    if (collection === undefined) {
                        collection = new groupSpec.Collection();
                        var panelSpec = require("../models/panelSpec.js")
                            .default;
                        var PanelSpecTypes = require("../utils/panelSpecTypes.js")
                            .default;
                        var groupState = require("../models/groupState.js")
                            .default;
                        var preferences = Ctx.getPreferences();
                        //console.log(preferences);
                        var defaultPanels;
                        // defined here and in groupContent.SimpleUIResetMessageAndIdeaPanelState
                        if (preferences.simple_view_panel_order === "NIM") {
                            defaultPanels = [
                                { type: PanelSpecTypes.NAV_SIDEBAR.id },
                                {
                                    type: PanelSpecTypes.IDEA_PANEL.id,
                                    minimized: true,
                                },
                                { type: PanelSpecTypes.MESSAGE_LIST.id },
                            ];
                        } else if (
                            preferences.simple_view_panel_order === "NMI"
                        ) {
                            defaultPanels = [
                                { type: PanelSpecTypes.NAV_SIDEBAR.id },
                                { type: PanelSpecTypes.MESSAGE_LIST.id },
                                {
                                    type: PanelSpecTypes.IDEA_PANEL.id,
                                    minimized: true,
                                },
                            ];
                        } else {
                            throw new Error(
                                "Invalid simple_view_panel_order preference: ",
                                preferences.simple_view_panel_order
                            );
                        }
                        var defaults = {
                            panels: new panelSpec.Collection(defaultPanels, {
                                viewsFactory: viewsFactory,
                            }),
                            navigationState: "debate",
                            states: new groupState.Collection([
                                new groupState.Model(),
                            ]),
                        };
                        collection.add(new groupSpec.Model(defaults));
                    }

                    collection.collectionManager = that;
                    Storage.bindGroupSpecs(collection);
                    that._allGroupSpecsCollectionPromise = Promise.resolve(
                        collection
                    );
                    return that._allGroupSpecsCollectionPromise;
                }
            );
        } else {
            return this._allGroupSpecsCollectionPromise;
        }
    }

    /**
     * Returns the collection of all roles
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getLocalRoleCollectionPromise
     **/
    getLocalRoleCollectionPromise() {
        if (this._allLocalRoleCollectionPromise) {
            return this._allLocalRoleCollectionPromise;
        }

        this._allLocalRoleCollection = new RoleModels.localRoleCollection();
        this._allLocalRoleCollection.collectionManager = this;
        this._allLocalRoleCollectionPromise = Promise.resolve(
            this._allLocalRoleCollection.fetch()
        )
            .thenReturn(this._allLocalRoleCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allLocalRoleCollectionPromise;
    }

    /**
     * Returns the collection of roles (a set of permissions)
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getLocalRoleCollectionPromise
     **/
    getMyLocalRoleCollectionPromise() {
        if (this._myLocalRoleCollectionPromise) {
            return this._myLocalRoleCollectionPromise;
        }

        this._myLocalRoleCollection = new RoleModels.myLocalRoleCollection();
        this._myLocalRoleCollection.collectionManager = this;
        this._myLocalRoleCollectionPromise = Promise.resolve(
            this._myLocalRoleCollection.fetch()
        )
            .thenReturn(this._myLocalRoleCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._myLocalRoleCollectionPromise;
    }

    /**
     * Returns the collection of publication states for ideas
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getIdeaPublicationStatesPromise
     **/
    getIdeaPublicationStatesPromise() {
        var flow;
        var that = this;
        if (this._allIdeaPublicationStatesPromise) {
            return this._allIdeaPublicationStatesPromise;
        }
        this._allIdeaPublicationStatesPromise = Promise.resolve(
            this.getIdeaPublicationFlowPromise()
        )
            .then((flow) => {
                that._allIdeaPublicationStates = flow.get("states");
                return that._allIdeaPublicationStates;
            })
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allIdeaPublicationStatesPromise;
    }

    getDiscussionAclPromise() {
        if (this._allDiscussionAclsPromise) {
            return this._allDiscussionAclsPromise;
        }
        this._allDiscussionAcls = new RoleModels.discPermCollection();
        this._allDiscussionAcls.collectionManager = this;
        this._allDiscussionAclsPromise = Promise.resolve(
            this._allDiscussionAcls.fetch()
        )
            .thenReturn(this._allDiscussionAcls)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allDiscussionAclsPromise;
    }

    getPubStatePermissionsPromise() {
        if (this._allPubStatePermissionsPromise) {
            return this._allPubStatePermissionsPromise;
        }
        this._allPubStatePermissions = new RoleModels.pubStatePermCollection();
        this._allPubStatePermissions.collectionManager = this;
        this._allPubStatePermissionsPromise = Promise.resolve(
            this._allPubStatePermissions.fetch()
        )
            .thenReturn(this._allPubStatePermissions)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allPubStatePermissionsPromise;
    }

    /**
     * Returns the model of discussions
     * @returns {BaseModel}
     * @function app.common.collectionManager.CollectionManager.getDiscussionModelPromise
     **/
    getDiscussionModelPromise() {
        if (this._allDiscussionModelPromise) {
            return this._allDiscussionModelPromise;
        }

        this._allDiscussionModel = new Discussion.Model();
        this._allDiscussionModel.collectionManager = this;
        this._allDiscussionModelPromise = Promise.resolve(
            this._allDiscussionModel.fetch()
        )
            .thenReturn(this._allDiscussionModel)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allDiscussionModelPromise;
    }

    /**
     * Returns the collection of external sources for discussions
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getDiscussionSourceCollectionPromise
     **/
    getDiscussionSourceCollectionPromise() {
        if (this._allDiscussionSourceCollectionPromise) {
            return this._allDiscussionSourceCollectionPromise;
        }

        this._allDiscussionSourceCollection = new DiscussionSource.Collection();
        this._allDiscussionSourceCollection.collectionManager = this;
        this._allDiscussionSourceCollectionPromise = Promise.resolve(
            this._allDiscussionSourceCollection.fetch()
        )
            .thenReturn(this._allDiscussionSourceCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allDiscussionSourceCollectionPromise;
    }

    /**
     * Returns the collection of external sources for discussions
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getDiscussionSourceCollectionPromise2
     **/
    getDiscussionSourceCollectionPromise2() {
        if (this._allDiscussionSourceCollection2Promise) {
            return this._allDiscussionSourceCollection2Promise;
        }

        this._allDiscussionSourceCollection2 = new DiscussionSources.Collection();
        this._allDiscussionSourceCollection2.collectionManager = this;
        this._allDiscussionSourceCollection2Promise = Promise.resolve(
            this._allDiscussionSourceCollection2.fetch()
        )
            .thenReturn(this._allDiscussionSourceCollection2)
            .catch(function (e) {
                Sentry.captureException(e);
            });

        return this._allDiscussionSourceCollection2Promise;
    }

    /**
     * Returns the collection of tokens to access Facebook accounts
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getFacebookAccessTokensPromise
     **/
    getFacebookAccessTokensPromise() {
        if (this._allFacebookAccessTokensPromise) {
            return this._allFacebookAccessTokensPromise;
        }

        this._allFacebookAccessTokens = new Social.Facebook.Token.Collection();
        this._allFacebookAccessTokens.collectionManager = this;
        this._allFacebookAccessTokensPromise = Promise.resolve(
            this._allFacebookAccessTokens.fetch()
        )
            .thenReturn(this._allFacebookAccessTokens)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allFacebookAccessTokensPromise;
    }

    /**
     * Returns the collection of user accounts
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllUserAccountsPromise
     **/
    getAllUserAccountsPromise() {
        if (this._allUserAccountsPromise) {
            return this._allUserAccountsPromise;
        }

        this._allUserAccounts = new Account.Collection();
        this._allUserAccounts.collectionManager = this;
        this._allUserAccountsPromise = Promise.resolve(
            this._allUserAccounts.fetch()
        )
            .thenReturn(this._allUserAccounts)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allUserAccountsPromise;
    }

    /**
     * Returns the collection of language preferences
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getUserLanguagePreferencesPromise
     **/
    getUserLanguagePreferencesPromise(Ctx) {
        if (this._allUserLanguagePreferencesPromise) {
            return this._allUserLanguagePreferencesPromise;
        }

        if (Ctx.isUserConnected()) {
            this._allUserLanguagePreferences = new LanguagePreference.Collection();
            this._allUserLanguagePreferences.collectionManager = this;
            this._allUserLanguagePreferencesPromise = Promise.resolve(
                this._allUserLanguagePreferences.fetch()
            )
                .thenReturn(this._allUserLanguagePreferences)
                .catch(function (e) {
                    Sentry.captureException(e);
                });
        } else {
            this._allUserLanguagePreferences = new LanguagePreference.DisconnectedUserCollection();
            this._allUserLanguagePreferencesPromise = Promise.resolve(
                this._allUserLanguagePreferences
            );
        }
        return this._allUserLanguagePreferencesPromise;
    }

    /**
     * Creates a collection of IdeaContentLink for a message
     * @param   {Object}  messageModel      The Backbone model of the message
     * @returns {BaseCollection}            The collection of ideaContentLinks
     * @function app.common.collectionManager.CollectionManager.getIdeaContentLinkCollectionOnMessage
     **/
    getIdeaContentLinkCollectionOnMessage(messageModel) {
        /*
      @TODO: Add efficient Collection management and caching
     */
        var id = messageModel.id;

        var ideaContentLinks = messageModel.getIdeaContentLinks();
        var tmp = new IdeaContentLink.Collection(ideaContentLinks, {
            message: messageModel,
        });
        tmp.collectionManager = this;
        return tmp;
    }

    /**
     * Returns the collection of publication flows
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllWidgetsPromise
     **/
    getAllPublicationFlowsPromise() {
        if (this._allPublicationFlowsPromise) {
            return this._allPublicationFlowsPromise;
        }

        this._allPublicationFlows = new PublicationFlow.publicationFlowCollection();
        this._allPublicationFlows.collectionManager = this;
        this._allPublicationFlowsPromise = Promise.resolve(
            this._allPublicationFlows.fetch()
        )
            .thenReturn(this._allPublicationFlows)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allPublicationFlowsPromise;
    }

    /**
     * Returns the collection of widgets
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getAllWidgetsPromise
     **/
    getAllWidgetsPromise() {
        if (this._allWidgetsPromise) {
            return this._allWidgetsPromise;
        }

        this._allWidgets = new Widget.Collection();
        this._allWidgets.collectionManager = this;
        this._allWidgetsPromise = Promise.resolve(this._allWidgets.fetch())
            .thenReturn(this._allWidgets)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allWidgetsPromise;
    }

    /**
     * Returns a subset of widgets according to the context and the idea
     * @param {Number} context
     * @param {Object} idea
     * @param {Object} liveupdate_keys
     * @returns {BackboneSubset}
     * @function app.common.collectionManager.CollectionManager.getWidgetsForContextPromise
     **/
    getWidgetsForContextPromise(context, idea, liveupdate_keys) {
        return this.getAllWidgetsPromise().then(function (widgets) {
            // TODO: Convert widgets into Infobar items, and use that as model.
            // Also add other sources for infobar items.
            return new Widget.WidgetSubset([], {
                parent: widgets,
                context: context,
                idea: idea,
                liveupdate_keys: liveupdate_keys,
            });
        });
    }

    /**
     * Returns the connected socket
     * @returns {Socket}
     * @function app.common.collectionManager.CollectionManager.getWidgetsForContextPromise
     **/
    getConnectedSocketPromise() {
        if (this._connectedSocketPromise) {
            return this._connectedSocketPromise;
        }

        var that = this;
        var socket = null;

        // Note: This does not solve the fact that the socket may disconnect.
        return (this._connectedSocketPromise = new Promise(function (resolve) {
            socket = new Socket(resolve, that);
        }));
    }

    /**
     * Returns the collection of preferences for this discussion
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getDiscussionPreferencePromise
     **/
    getDiscussionPreferencePromise() {
        if (this._allDiscussionPreferencesPromise) {
            return this._allDiscussionPreferencesPromise;
        }

        this._allDiscussionPreferences = new DiscussionPreference.DiscussionPreferenceCollection();
        this._allDiscussionPreferences.collectionManager = this;
        this._allDiscussionPreferencesPromise = Promise.resolve(
            this._allDiscussionPreferences.fetch()
        )
            .thenReturn(this._allDiscussionPreferences)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allDiscussionPreferencesPromise;
    }

    /**
     * Returns the collection of preferences for all discussions
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getGlobalPreferencePromise
     **/
    getGlobalPreferencePromise() {
        if (this._globalPreferencesPromise) {
            return this._globalPreferencesPromise;
        }

        this._globalPreferences = new DiscussionPreference.GlobalPreferenceCollection();
        this._globalPreferences.collectionManager = this;
        this._globalPreferencesPromise = Promise.resolve(
            this._globalPreferences.fetch()
        )
            .thenReturn(this._globalPreferences)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._globalPreferencesPromise;
    }

    /**
     * Returns the collection of preferences for all users
     * @returns {BaseCollection}
     * @function app.common.collectionManager.CollectionManager.getUserPreferencePromise
     **/
    getUserPreferencePromise() {
        if (this._allUserPreferencesPromise) {
            return this._allUserPreferencesPromise;
        }

        // TODO: initalize from Ctx.getJsonFromScriptTag('preferences')
        // and replace Ctx.getPreferences by this.
        this._allUserPreferences = new DiscussionPreference.UserPreferenceCollection();
        this._allUserPreferences.collectionManager = this;
        this._allUserPreferencesPromise = Promise.resolve(
            this._allUserPreferences.fetch()
        )
            .thenReturn(this._allUserPreferences)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allUserPreferencesPromise;
    }

    getNotificationsUserCollectionPromise(reset) {
        if (this._allNotificationsUserCollectionPromise && !reset) {
            return this._allNotificationsUserCollectionPromise;
        }
        this._allNotificationsUserCollection = new NotificationSubscription.Collection();
        this._allNotificationsUserCollection.setUrlToUserSubscription();
        this._allNotificationsUserCollection.collectionManager = this;
        this._allNotificationsUserCollectionPromise = Promise.resolve(
            this._allNotificationsUserCollection.fetch()
        )
            .thenReturn(this._allNotificationsUserCollection)
            .catch(function (e) {
                Sentry.captureException(e);
            });
        return this._allNotificationsUserCollectionPromise;
    }
}

var _instance;

export default function () {
    if (!_instance) {
        _instance = new CollectionManager();
    }

    return _instance;
}
