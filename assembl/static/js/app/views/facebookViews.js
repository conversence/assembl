/**
 *
 * @module app.views.facebookViews
 */

import Marionette from "backbone.marionette";

import Backbone from "backbone";
import _ from "underscore";
import Ctx from "../common/context.js";
import i18n from "../utils/i18n.js";
import $ from "jquery";
import Types from "../utils/types.js";
import Promise from "bluebird";
import Moment from "moment";
import CollectionManager from "../common/collectionManager.js";
import Social from "../models/social.js";
import LoaderView from "./loaderView.js";
import Source from "../models/sources.js";

var _allFacebookPermissions = undefined;
var getAllFacebookPermissions = function () {
    if (_allFacebookPermissions) {
        return _allFacebookPermissions;
    } else {
        _allFacebookPermissions = $("#js_fb-permissions-list").html().trim();
        return _allFacebookPermissions;
    }
};

//window.moment = Moment; //Purely debug
var _convertTimeToISO8601 = function (time) {
    var m = new Moment().utc().add(time, "seconds");
    return m.toISOString();
};

var messageDefaults = {
    //Creator comes from a resolved Promise and may NOT not be an existing
    //value at first render.
    header: function (creator) {
        if (!creator) {
            return i18n.sprintf(
                i18n.gettext("The following message was posted on %s:\n\n\n"),
                platform_name
            );
        }
        return i18n.sprintf(
            i18n.gettext(
                "The following message was posted by %1$s on %2$s:\n\n\n"
            ),
            creator.get("name"),
            platform_name
        );
    },
    footer: function (post_model) {
        //This SHOULD be shortened using bit.ly
        var link = post_model.getRouterUrl({
            parameters: {
                source: "share",
            },
        });
        return (
            i18n.gettext(
                "Please be aware that comments below will be imported into a discussion found at "
            ) + link
        );
    },
};

var _composeMessageBody = function (model, creator, header, extra) {
    var header_default = messageDefaults.header(creator);
    var body = model.get("body");
    var footer = messageDefaults.footer(model);

    var msg = "";
    if (header) {
        msg += header;
    } else {
        msg += header_default;
    }

    msg += "\n\n";
    msg += body;

    if (extra) {
        msg += "\n\n";
        msg += "-----------------------------------------------------------";
        msg += "\n\n";
        msg += extra;
    }

    msg += "\n\n\n\n";
    msg += footer;

    return {
        header: header,
        body: body,
        extra: extra,
        footer: footer,
        full: msg,
    };
};

var _updateBundledData = function (bundle, updates) {
    //jQuery extend does deep copy
    //Nested object in bundle
    $.extend(bundle, updates);
};

/**
 * Global token placeholder
 *
 * Page and Group will look like:
 * {
 *   page_id: {
 *     token: null,
 *     expiration: null
 *   }
 * }
 * @type {Object}
 */
var fb_token = function () {
    this.user = null;
    this.page = null;
    this.group = null;
    this.collectionManager = new CollectionManager();

    this.setExpiration = function (e, success) {
        var time = null;
        if (!e) {
            // Hacky solution for front-end only, expiration of null can mean
            // inifinite token, therefore add time of 10 years. Nobody in their
            // right mind would keep a browser tab open for 10 years.

            time = new Moment().utc().add(10, "years");
        } else if (typeof e === "number") {
            //Ensure that the incoming datetime has no timezone information
            //before adding the UTC timezone to it
            time = new Moment().utc().add(e, "seconds");
        } else {
            var tzoneTime = new Social.Facebook.Token.Time().processTimeToUTC(
                e
            );
            time = new Moment(tzoneTime).utc();
        }

        success(time);
    };
};

fb_token.prototype = {
    setUserToken: function (token, expiration) {
        if (!this.user) {
            this.user = {
                token: null,
                expiration: null,
            };
        }

        this.user.token = token;
        var that = this;
        this.setExpiration(expiration, function (value) {
            that.user.expiration = value;
        });
    },
    setPageToken: function (pageId, token, expiration) {
        if (!this.page) {
            this.page = {};
        }

        if (!this.page[pageId]) {
            this.page[pageId] = {};
        }

        this.page[pageId]["token"] = token;
        var that = this;
        this.setExpiration(expiration, function (value) {
            that.page[pageId]["expiration"] = value;
        });
    },
    setGroupToken: function (groupId, token, expiration) {
        if (!this.group) {
            this.group = {};
        }

        if (!this.group[groupId]) {
            this.group[groupId] = {};
        }

        this.group[groupId]["token"] = token;
        this.setExpiration(expiration, function (value) {
            that.group[groupId]["expiration"] = value;
        });
    },
    getUserToken: function () {
        if (_.has(this.user, "token")) {
            return this.user.token;
        } else {
            return null;
        }
    },
    getPageToken: function (pageId) {
        if (!_.has(this.page, pageId)) {
            return null;
        } else {
            return this.page[pageId].token;
        }
    },
    getGroupToken: function (groupId) {
        if (!_.has(this.group, groupId)) {
            return null;
        } else {
            return this.group[groupId].token;
        }
    },
    getAllPageTokens: function () {
        return this.page;
    },
    getAllGroupTokens: function () {
        return this.group;
    },
    isUserTokenExpired: function () {
        if (this.user) {
            var now = Moment().utc();
            return now.isAfter(this.user.expiration);
        } else {
            //If there is no token, then it is equivalent to having
            //an expired token. Must get a new one and set it.
            return true;
        }
    },
    isPageTokenExpired: function (pageId) {
        if (this.page.hasOwnProperty(pageId)) {
            var now = new Moment().utc();
            return now.isAfter(this.page.expiration);
        } else {
            return true;
        }
    },
    isGroupTokenExpired: function (groupId) {
        if (this.group.hasOwnProperty(groupId)) {
            var now = new Moment().utc();
            return now.isAfter(this.group.expiration);
        } else {
            return true;
        }
    },
};

//Is it important to type it to the window object? Not certain
window.FB_TOKEN = new fb_token();

/**
 * Encapsulating the state of the user and their facebook account
 * @param  r: The ready state, true if user has fbAccount && accessToken
 * @param  e: The error state, enum of 'permissions', 're-login', 'create'
 * @param  t: The USER access token that will be used to make API calls
 * @returns   null
 */
var fbState = function (r, e, t) {
    this.ready = r;
    this.errorState = e;
    this.token = t;
};

// ********************************** DEBUGGING FUNCTIONS ********************************************************
var loginUser_fake = function (success) {
    var scope = getAllFacebookPermissions();
    window.FB.login(function (resp) {
        if (resp.status !== "connected") {
            console.error("User did not accept the list of permissions");
        } else {
            window.FB_TOKEN.setUserToken(
                resp.authResponse.accessToken,
                resp.authResponse.expiresIn
            );
            success();
        }
    });
};

//For debugging purposes only
var checkState_shim = function (renderer) {
    loginUser_fake(function () {
        var state = new fbState(true, null);
        renderer(state);
    });
};

//Also for debugging simple functions in the root view
var checkState_shim_2 = function (renderer) {
    var state = new fbState(true, null, null);
    renderer(state);
};

// ***************************************************************************************************************

var fbApi = function (options, success, error) {
    var source = options.endpoint;
    var httpType = options.http || "get";
    var qs = options.fields;

    window.FB.api(source, httpType, qs, function (resp) {
        if (_.has(resp, "error")) {
            console.error(resp.error);
            if (error !== "function") {
                var eMessage = i18n.gettext(
                    "An error occured whilst communicating with Facebook. Close the box and try again."
                );
                $(".js_export_error_message").text(eMessage);
            } else {
                error(resp);
            }
        } else {
            success(resp);
        }
    });
};

//Might cause a stack overflow if the data is very large, or many many pages....
var getAllPaginatedEntities = function (endPoint, options, success) {
    /**
     * Appends the values from set2 into set1
     * @param  {Object} set1 Obj with key of {fb_id: data}
     * @param  {Object} set2 Obj with key of {fb_id: data}
     * @returns {Object}      Obj with unique objects of {fb_id: data}
     */

    var getData = function (resp, data) {
        if (_.has(resp, "paging") && _.has(resp.paging, "next")) {
            fbApi({ endpoint: resp.paging.next, fields: options }, function (
                resp
            ) {
                getData(resp, data.concat(resp.data));
            });
        } else {
            var results = data.concat(resp.data); //Concat last page of data with current data
            success(results); //results *COULD* have duplicates. Check downstream to ensure it works.
            return;
        }
    };

    fbApi({ endpoint: endPoint, fields: options }, function (resp) {
        getData(resp, resp.data);
    });
};

//Used to make a unique list from paginated data above.
//Must have an ID field in order to create a unique list
var uniqify = function (data) {
    var tmp = {};
    _.each(data, function (d, i, a) {
        if (!_.has(tmp, d.id)) {
            tmp[d.id] = d;
        }
    });
    return _.values(tmp);
};

// var validatePermissionsAccepted = function(){
//   getAllPaginatedEntities('me/permissions', {access_token: window.FB_TOKEN.getUserToken()}, function(permissions){
//     var permissionList = getAllFacebookPermissions(),
//         permissionDict = _.extend({}, _.values(permissionList)); //This might not work, check.

//     _.each(permissions, function(p,i,arr){

//     });
//   });
// }

var _processLogin = function (resp, success, error) {
    window.FB_TOKEN.collectionManager
        .getFacebookAccessTokensPromise()
        .then(function (tokens) {
            if (tokens.hasUserToken()) {
                //At this point, the page/group tokens are not priority
                //They will be dealt with by their respective views
                //on instantiation, but must first store them in the
                //global token singleton

                var token = tokens.getUserToken();
                console.log("Currently existing user token", token);
                token.save(
                    {
                        token: resp.authResponse.accessToken,
                        expiration: _convertTimeToISO8601(
                            resp.authResponse.expiresIn
                        ),
                    },
                    {
                        patch: true,
                        success: function (model, resp, opt) {
                            window.FB_TOKEN.setUserToken(
                                model.get("token"),
                                model.get("expiration")
                            );
                            tokens.add(model, { merge: true }); //Find existing model in collection & update fields
                            success();
                        },
                        error: function (model, resp, opt) {
                            console.error(
                                "Failed to update a user access token from backend!",
                                resp
                            );
                            window.FB_TOKEN.setUserToken(
                                model.get("token"),
                                model.get("expiration")
                            );
                            error();
                        },
                    }
                );
            } else {
                //No user token, must make one
                var token = new Social.Facebook.Token.Model({
                    token: resp.authResponse.accessToken,
                    expiration: _convertTimeToISO8601(
                        resp.authResponse.expiresIn
                    ),
                    token_type: "user",
                    "@type": "FacebookAccessToken",
                });
                token.save(null, {
                    success: function (model, resp, opt) {
                        window.FB_TOKEN.setUserToken(
                            model.get("token"),
                            model.get("expiration")
                        );
                        tokens.add(model);
                        success();
                    },
                    error: function (model, resp, opt) {
                        console.error(
                            "Failed to create a user access token from backend!",
                            resp
                        );
                        window.FB_TOKEN.setUserToken(
                            model.get("token"),
                            model.get("expiration")
                        );
                        error();
                    },
                });
            }
        })
        .error(function (e) {
            // Cannot get the access tokens from db
            console.error(
                "Failed to create or update facebook access token from backend",
                e
            );
            error();
        });
};

//Delete function for loggin user in. Will need this if user logs out of
//of facebook when form is active
var loginUser = function (success) {
    //Permissions are pre-rendered from the back-end
    //into a hidden div.
    var scope = getAllFacebookPermissions();
    window.FB.login(
        function (resp) {
            //Check list of permissions given to see if it matches what we asked.
            //If not, cannot continue
            //If yes, re-render the view.
            //Add event handlers for if things change
            if (resp.status !== "connected") {
                console.error("The user was not logged into Facebook.");
                //Maybe add a red warning under the errorView that the login process failed ?
                $(".js_export_error_message").text(
                    i18n.gettext(
                        "You did not log into facebook. Please log-in to continue."
                    )
                );
            } else {
                // TODO: Check permission list up to date
                // TODO: Add SDK Event handlers for if they sign out/revoke permissions
                _processLogin(resp, success);
            }
        },
        { scope: scope }
    );
};

var checkLoginState = function (options) {
    //Instead of using login function, use the loginState api call, force to get facebook information.
    //If they are not connected, ask to login with our permissions.
    //If they are logged in already, then update the token field!
    //If it fails, raise an error.

    window.FB.getLoginStatus(function (resp) {
        if (_.has(resp, "error")) {
            var errorMessage = i18n.gettext(
                "There was an issue with getting your Facebook login status. Please close this box and contact your discussion administrator."
            );
            $(".js_export_error_message").text(errorMessage);
            console.error(
                "Facebook SDK failed to get the loginStatus of Facebook user",
                resp
            );
        } else {
            if (resp.status !== "connected") {
                options.error();
            } else {
                _processLogin(resp, options.success, options.error);
            }
        }
    }, true); //force to fetch status from server, instead of local cache
};

//Entry point in this module
var checkState = function (renderView) {
    //if this account IS a facebookAccount, then check for
    //permissions and move on
    var collectionManager = new CollectionManager();

    collectionManager
        .getAllUserAccountsPromise()
        .then(function (accounts) {
            // Assumes that there is only 1 facebook account per user
            if (!accounts.hasFacebookAccount()) {
                var state = new fbState(false, "create", null);
                renderView(state);
                return false;
            } else {
                return collectionManager.getFacebookAccessTokensPromise();
            }
        })
        .then(function (tokens) {
            //If the Promise returns false, do nothing; the errorView has
            //already been created

            if (tokens !== false) {
                //Cache all current tokens, then update userToken accordingly.
                tokens.each(function (token, i, arr) {
                    var fb_id = token.get("object_fb_id");
                    var t = token.get("token");
                    var e = token.get("expiration");

                    if (token.isPageToken()) {
                        window.FB_TOKEN.setPageToken(fb_id, t, e);
                    } else if (token.isGroupToken()) {
                        window.FB_TOKEN.setGroupToken(fb_id, t, e);
                    } else {
                        //FB_TOKEN will deal with infinite condition
                        window.FB_TOKEN.setUserToken(t, e);
                    }
                });
                var userToken = tokens.getUserToken();
                if (!userToken) {
                    var state = new fbState(false, "permissions", null);
                    renderView(state);
                } else {
                    //Check token expiry
                    if (userToken.isExpired()) {
                        checkLoginState({
                            success: function () {
                                var state = new fbState(
                                    true,
                                    null,
                                    window.FB_TOKEN
                                );
                                renderView(state);
                            },
                            error: function () {
                                var state = new fbState(
                                    false,
                                    "update-permissions",
                                    null
                                );
                                renderView(state);
                            },
                        });
                    } else {
                        //Token not expired, serve it up
                        window.FB_TOKEN.setUserToken(
                            userToken.get("token"),
                            userToken.get("expiration")
                        );
                        var state = new fbState(true, null, window.FB_TOKEN);
                        renderView(state);
                    }
                }
            }
        });
};

class errorView extends Marionette.View.extend({
    template: "#tmpl-exportPostModal-fb-token-error",

    ui: {
        login: ".js_fb-create-action",
    },

    events: {
        "click @ui.login": "checkAndLoginUser",
    },
}) {
    initialize(options) {
        this.vent = options.vent; //Event Aggregator
        if (options.ready === false) {
            if (options.errorState === "permissions") {
                this.msg = i18n.gettext(
                    "Great! You already have a facebook account. Below are the list of permissions we need for the exportation process."
                );
                this.subMsg = i18n.gettext(
                    "Click here if you agree with these permissions."
                );
                this.state = options.errorState;
            } else if (options.errorState === "update-permissions") {
                this.msg = i18n.sprintf(
                    i18n.gettext(
                        "It appears that your session was expired. Click below to refresh your session. As always, below are the permissions that %s would need to continue."
                    ),
                    platform_name
                );
                this.subMsg = i18n.gettext("Click here to continue.");
                this.state = options.errorState;
            } else {
                this.msg = i18n.gettext(
                    "You must create an account. Warning: This will refresh the page"
                );
                this.subMsg = i18n.gettext(
                    "Sign in using your Facebook account"
                );
                this.state = options.errorState;
            }
        }
    }

    serializeData() {
        return {
            message: this.msg,
            subMessage: this.subMsg,
        };
    }

    checkAndLoginUser(event) {
        if (this.state === "permissions") {
            var that = this;
            loginUser(function () {
                that.vent.trigger("reloadBase");
                //console.error("FIXME:  Need to re-render baseFbView");
            });
        } else {
            Backbone.history.navigate("user/account", { trigger: true });
            Ctx.clearModal();
        }
    }
}

class groupView extends LoaderView.extend({
    template: "#tmpl-exportPostModal-fb-group",

    events: {
        "change .js_fb-group-id": "updateEndpoint",
    },
}) {
    initialize(options) {
        this.setLoading(true);
        this.bundle = options.bundle;
        this.vent = options.vent;
        var that = this;

        var opts = {
            access_token: window.FB_TOKEN.getUserToken(),
            fields: "id,name",
        };
        getAllPaginatedEntities("me/groups", opts, function (groupData) {
            var cleanData = uniqify(groupData);
            that.userGroups = cleanData;

            that.setLoading(false);
            that.vent.trigger("clearError");
            that.render();
        });
    }

    updateEndpoint(e) {
        var value = $(e.currentTarget).find("option:selected").val();

        if (value !== "null") {
            _updateBundledData(this.bundle, {
                endpoint: value + "/feed",
            });
        } else {
            _updateBundledData(this.bundle, {
                endpoint: null,
            });
        }
        this.vent.trigger("clearError");
    }

    serializeData() {
        // var tmp = [
        //   {value: 'null', description: ''},
        //   {value: 'self', description: 'Yourself'}
        // ];
        var tmp = [{ value: "null", description: "" }];
        var m = _.map(this.userGroups, function (g) {
            return { id: g.id, name: g.name };
        });

        return { groups: tmp.concat(m) };
    }
}

class pageView extends LoaderView.extend({
    template: "#tmpl-exportPostModal-fb-page",

    events: {
        "change .js_fb-page-voice": "updateSender",
        "change .js_fb-page-id": "updateEndpoint",
    },
}) {
    initialize(options) {
        this.setLoading(true);
        this.bundle = options.bundle;
        this.vent = options.vent;
        var that = this;
        var accountOptions = {
            access_token: window.FB_TOKEN.getUserToken(),
            fields: "id,name,access_token",
        };
        getAllPaginatedEntities("me/accounts", accountOptions, function (
            adminData
        ) {
            var cleanData = uniqify(adminData);
            that.userPages = cleanData;
            _.each(cleanData, function (d, i, a) {
                window.FB_TOKEN.setPageToken(d.id, d.access_token, 30 * 60); //hack - Give it a 30 min lifespan
            });

            var pageOptions = {
                access_token: window.FB_TOKEN.getUserToken(),
                fields: "id,name",
            };
            getAllPaginatedEntities("me/likes", pageOptions, function (
                pageData
            ) {
                var cleanedPages = uniqify(pageData);
                that.pages = cleanedPages;

                that.setLoading(false);
                that.render();
                that.vent.trigger("clearError");
            });
        });
    }

    updateEndpoint(e) {
        var value = this.$(e.currentTarget).find("option:selected").val();
        if (value !== "null") {
            _updateBundledData(this.bundle, {
                endpoint: value + "/feed",
            });
        } else {
            _updateBundledData(this.bundle, {
                endpoint: null,
            });
        }
        this.vent.trigger("clearError");
    }

    updateSender(e) {
        var value = this.$(e.currentTarget).find("option:selected").val();

        if (value === "self" || value === "null") {
            _updateBundledData(this.bundle, {
                credentials: window.FB_TOKEN.getUserToken(),
            });
        } else {
            _updateBundledData(this.bundle, {
                credentials: window.FB_TOKEN.getPageToken(value),
            });
        }
    }

    serializeData() {
        var adminTmp = [
            { value: "null", description: "" },
            { value: "self", description: "Yourself" },
        ];

        var extras = _.map(this.userPages, function (admin) {
            return {
                value: admin.id,
                description: admin.name,
            };
        });

        var pageTmp = [{ value: "null", name: "" }];
        var pages = _.map(this.pages, function (page) {
            return {
                value: page.id,
                name: page.name,
            };
        });

        return {
            userManagedPagesList: adminTmp.concat(extras),
            pages: pageTmp.concat(pages),
        };
    }
}

class exportPostForm extends Marionette.View.extend({
    template: "#tmpl-exportPostModal-fb",

    regions: {
        subform: ".fb-targeted-form",
    },

    ui: {
        test: ".fb-js_test_area",
        supportedList: ".js_fb-supportedList",
        messageHeader: ".js_fb_message_header",
        messageExtra: ".js_fb_message_extra",
    },

    events: {
        "change @ui.supportedList": "defineView",
        "click @ui.test": "test",
    },
}) {
    initialize(options) {
        this.setLoading(true);
        // this.token = options.token;
        this.exportedMessage = options.exportedMessage;
        this.vent = options.vent; //Event Aggregator
        this.bundle = {
            endpoint: null,
            credentials: window.FB_TOKEN.getUserToken(),
            attachPic: null,
            attachSubject: null,
            attachCaption: null,
            attachDesc: null,
        };

        var that = this;
        var cm = new CollectionManager();
        Promise.join(
            this.exportedMessage.getCreatorPromise(),
            cm.getUserLanguagePreferencesPromise(Ctx),
            function (creator, ulp) {
                that.translationData = ulp.getTranslationData();
                that.messageCreator = creator;
                return cm.getDiscussionModelPromise();
            }
        ).then(function (d) {
            that.topic = d.get("topic");
            that.desc = i18n.sprintf(
                i18n.gettext(
                    "%s is a collective intelligence tool designed to enable open, democratic discussions that lead to idea generation and innovation."
                ),
                platform_name
            );
            that.setLoading(false);
            that.render();
            that.vent.trigger("clearError");
        });
    }

    serializeData() {
        if (this.isLoading()) {
            return {};
        }
        return {
            exportedMessage: this.exportedMessage,
            exportedMessageBody: this.exportedMessage
                .get("body")
                .best(this.getTranslationData),
            suggestedName: this.topic,
            suggestedCaption: window.location.href,
            suggestedDescription: this.desc,
            suggestedHeader: messageDefaults.header(this.messageCreator),
            messageFooter: messageDefaults.footer(this.exportedMessage),
        };
    }

    test(e) {
        var v1 = _composeMessageBody(
            this.exportedMessage,
            this.messageCreator,
            null,
            null
        );
        var v2 = _composeMessageBody(
            this.exportedMessage,
            this.messageCreator,
            "A random header",
            "Extra information here..."
        );

        console.log("Null header, null extra", v1);
        console.log("Header, Extra", v2);
    }

    defineView(event) {
        var value = this.$(event.currentTarget).find("option:selected").val();

        switch (value) {
            case "page":
                this.showChildView(
                    "subform",
                    new pageView({
                        token: this.token,
                        bundle: this.bundle,
                        vent: this.vent,
                    })
                );
                break;
            case "group":
                this.showChildView(
                    "subform",
                    new groupView({
                        token: this.token,
                        bundle: this.bundle,
                        vent: this.vent,
                    })
                );
                break;
            case "me":
                _updateBundledData(this.bundle, {
                    endpoint: "me/feed",
                });
                this.vent.trigger("clearError");
                break;
            default:
                //This might be the wrong approach to emptying the region
                this.getRegion("subform").reset();
                _updateBundledData(this.bundle, {
                    endpoint: null,
                });
                break;
        }
    }

    saveModel(success, error) {
        var that = this;
        var errorMsg = i18n.gettext(
            "Facebook was unable to create the post. Close the box and try again."
        );
        var getLink = function () {
            var tmp = $(".js_fb-attachment-link").val();
            if (!tmp) {
                return null;
            }

            return tmp;
        };

        var getName = function () {
            var tmp = $(".js_fb-suggested-name").val();
            if (!tmp) {
                // return that.topic;
                return null;
            }

            return tmp;
        };
        var getCaption = function () {
            var tmp = $(".js_fb-suggested-caption").val();
            if (!tmp) {
                // return window.location.href;
                return null;
            }

            return tmp;
        };
        var getDescription = function () {
            var tmp = $(".js_fb-suggested-description").val();
            if (!tmp) {
                // return that.desc;
                return null;
            }

            return tmp;
        };

        var getHeader = function () {
            var tmp = $(".js_fb_message_header").val();
            if (!tmp) {
                return null;
            }
            return tmp;
        };

        var getMessageExtra = function () {
            var tmp = $(".js_fb_message_extra").val();
            if (!tmp) {
                return null;
            }
            return tmp;
        };

        var _removeNullArgs = function (args) {
            return _.chain(args).invert().omit("null").invert().value();
        };

        var endpoint = this.bundle.endpoint;
        var hasAttach = this.bundle.attachPic !== null;
        this.exportedMessage
            .getCreatorPromise()
            .then(function (messageCreator) {
                var args = {
                    access_token: that.bundle.credentials,
                    message: _composeMessageBody(
                        that.exportedMessage,
                        messageCreator,
                        getHeader(),
                        getMessageExtra()
                    ).full,

                    //picture : 'http://' + window.location.host +"/" + Ctx.getApiV2DiscussionUrl() + "/mindmap",
                    // picture: 'http://assembl.coeus.ca/static/css/themes/default/img/crowd2.jpg', //Such a shit hack
                    // picture: 'http://' + window.location.host + '/static/css/themes/default/img/crowd2.jpg',
                    link: getLink(),
                    name: getName(),
                    caption: getCaption(),
                    description: getDescription(),
                };

                args = _removeNullArgs(args);

                if (!endpoint) {
                    var er = i18n.gettext(
                        "Please select between pages, groups or your wall as the final destination to complete the form."
                    );
                    $(".js_export_error_message").text(er);
                } else {
                    fbApi(
                        { endpoint: endpoint, http: "post", fields: args },
                        function (resp) {
                            if (_.has(resp, "error")) {
                                console.error(
                                    "There was an error with creating the post",
                                    resp.error
                                );
                                error(errorMsg);
                            } else if (!_.has(resp, "id")) {
                                console.error(
                                    "Facebook did not return the ID of the newly created post"
                                );
                                error(errorMsg);
                            } else {
                                var fbPostId = resp.id;
                                var sender = null;
                                var cm = new CollectionManager();

                                // 1) Create the source
                                // 2) Create the ContentsourceId
                                // 3) POST for a newly created pull source reader
                                // 4) Then call success

                                errorMsg = i18n.sprintf(
                                    i18n.gettext(
                                        "Something went wrong on %s whilst creating your post. Please contact the Discussion administrator for more information."
                                    ),
                                    platform_name
                                );
                                cm.getAllUserAccountsPromise().then(function (
                                    accounts
                                ) {
                                    var fbAccount = accounts.getFacebookAccount();
                                    if (!fbAccount) {
                                        console.error(
                                            "This account does NOT have a facebook account",
                                            accounts
                                        );
                                        error(errorDesc);
                                    } else {
                                        sender = fbAccount;
                                        that.model.set({
                                            fb_source_id: fbPostId,
                                            creator_id: sender.get("@id"),
                                            is_content_sink: true,
                                            sink_data: {
                                                post_id:
                                                    that.exportedMessage.id,
                                                facebook_post_id: fbPostId,
                                            },
                                        });

                                        that.model.save(null, {
                                            success: function (
                                                model,
                                                resp,
                                                op
                                            ) {
                                                Promise.resolve(
                                                    $.ajax({
                                                        type: "POST",
                                                        dataType: "json",
                                                        url:
                                                            model.url() +
                                                            "/fetch_posts",
                                                        contentType:
                                                            "application/json",
                                                    })
                                                )
                                                    .then(function (resp) {
                                                        if (
                                                            _.has(
                                                                resp,
                                                                "message"
                                                            )
                                                        ) {
                                                            success();
                                                        } else {
                                                            console.error(
                                                                "There was a server-side error",
                                                                resp
                                                            );
                                                            error(errorDesc);
                                                        }
                                                    })
                                                    .error(function (error) {
                                                        console.error(
                                                            "There was an error creating the source"
                                                        );
                                                        error(errorDesc);
                                                    });
                                            },

                                            error: function (model, resp, op) {
                                                console.error(
                                                    "Could not create a Facebook source"
                                                );
                                                error(errorDesc);
                                            },
                                        });
                                    }
                                });
                            }
                        }
                    );
                }
            });
    }
}

class FacebookSourceForm extends Marionette.View.extend({
    template: "#tmpl-facebookSourceForm",

    regions: {
        sourcePicker: ".source_picker",
    },

    ui: {
        lower_bound: ".js_lower_bound",
        upper_bound: ".js_upper_bound",
    },
}) {
    initialize(options) {
        this.token = options.token;
        this.vent = options.vent; //Event Aggregator
        this.bundle = {
            endpoint: null,
            credentials: window.FB_TOKEN.getUserToken(),
        };
    }

    getModelData(sender) {
        var result = {
            creator_id: sender.get("@id"),
            endpoint: this.bundle.endpoint,
            sink_data: {},
        };
        var limit = this.ui.lower_bound.val();
        if (limit) {
            result.lower_bound = limit;
        }
        limit = this.ui.upper_bound.val();
        if (limit) {
            result.upper_bound = limit;
        }
        return result;
    }

    saveModel(success, error) {
        var that = this;
        var cm = new CollectionManager();
        cm.getAllUserAccountsPromise().then(function (accounts) {
            var fbAccount = accounts.getFacebookAccount();
            if (!fbAccount) {
                console.error("This account does NOT have a facebook account");
                error(
                    i18n.gettext(
                        "This account does NOT have a facebook account"
                    )
                );
            } else {
                that.model.set(that.getModelData(fbAccount));

                that.model.save(null, {
                    success: function (model, resp, op) {
                        Promise.resolve(
                            $.ajax({
                                type: "POST",
                                dataType: "json",
                                url: model.url() + "/fetch_posts",
                                contentType:
                                    "application/x-www-form-urlencoded",
                            })
                        )
                            .then(function (resp) {
                                if (_.has(resp, "message")) {
                                    success();
                                } else {
                                    console.error(
                                        "There was a server-side error"
                                    );
                                    error(
                                        i18n.gettext(
                                            "Could not create the message source"
                                        )
                                    );
                                }
                            })
                            .error(function (error) {
                                console.error(
                                    "There was an error creating the source"
                                );
                                error(
                                    i18n.gettext(
                                        "There was an error creating the message source"
                                    )
                                );
                            });
                    },
                    error: function (model, resp, op) {
                        console.error("Could not create a Facebook source");
                        error(
                            i18n.gettext(
                                "There was an error creating the message source"
                            )
                        );
                    },
                });
            }
        });
    }
}

class publicGroupSourceForm extends FacebookSourceForm {}

class privateGroupSourceForm extends FacebookSourceForm {
    onRender() {
        this.groupView = new groupView({
            token: this.token,
            bundle: this.bundle,
            vent: this.vent,
        });
        this.showChildView("sourcePicker", this.groupView);
    }

    getModelData(sender) {
        if (this.bundle.endpoint) {
            var endpoint = this.bundle.endpoint;
            var groupId = endpoint.substr(0, endpoint.length - 5);
            var modelData = super.getModelData(...arguments);
            modelData.fb_source_id = groupId;
            return modelData;
        }
    }
}

class pageSourceForm extends FacebookSourceForm {
    onRender() {
        this.pageView = new pageView({
            token: this.token,
            bundle: this.bundle,
            vent: this.vent,
        });
        this.showChildView("sourcePicker", this.pageView);
    }

    getModelData(sender) {
        if (this.bundle.endpoint) {
            var endpoint = this.bundle.endpoint;
            var pageId = endpoint.substr(0, endpoint.length - 5);
            var modelData = super.getModelData(...arguments);
            modelData.fb_source_id = pageId;
            return modelData;
        }
    }
}

class basefbView extends Marionette.View.extend({
    template: "#tmpl-sourceFacebook",

    ui: {
        root: ".js_facebook_view",
    },

    regions: {
        subForm: "@ui.root",
    },

    events: {
        "click .js_ok_submit": "submitForm",
    },

    modelEvents: {
        change: "render",
    },
}) {
    initialize(options) {
        this.vent = _.extend({}, Backbone.Events);
        this.model = options.model;
        this.exportedMessage = options.exportedMessage;

        this.vent.on("reloadBase", this.onRender, this);
    }

    onRender() {
        var that = this;
        checkState(function (fbState) {
            console.log("The state of the checkState function", fbState);
            if (fbState.ready) {
                var fbView;
                if (that.exportedMessage) {
                    fbView = new exportPostForm({
                        model: that.model,
                        exportedMessage: that.exportedMessage,
                        vent: that.vent,
                    });
                } else {
                    var viewClass;
                    switch (that.model.get("@type")) {
                        case Types.FACEBOOK_GROUP_SOURCE_FROM_USER:
                            viewClass = privateGroupSourceForm;
                            break;
                        case Types.FACEBOOK_PAGE_FEED_SOURCE:
                        case Types.FACEBOOK_PAGE_POSTS_SOURCE:
                            viewClass = pageSourceForm;
                            break;
                        case Types.FACEBOOK_GROUP_SOURCE:
                            viewClass = publicGroupSourceForm;
                            break;
                        case Types.FACEBOOK_SINGLE_POST_SOURCE:
                            viewClass = exportPostForm;
                            break;
                        default:
                            console.error(
                                "unknown type " + that.model.get("@type")
                            );
                            // FIXME: need better i18n (using %s)
                            var err = i18n.gettext(
                                "There was an error with creating a source of type" +
                                    that.model.get("@type")
                            );
                            $(".js_export_error_message").text(er);
                    }
                    if (viewClass) {
                        fbView = new viewClass({
                            model: that.model,
                            vent: that.vent,
                        });
                    }
                }
                that.fbView = fbView;
                if (fbView) {
                    that.showChildView("subForm", fbView);
                } else {
                    that.showChildView("subForm", "");
                }
            } else {
                var errView = new errorView({
                    ready: fbState.ready,
                    errorState: fbState.errorState,
                    vent: that.vent,
                    model: that.model,
                });

                that.showChildView("subForm", errView);
            }
        });
    }

    submitForm(e) {
        console.log("submitting form");
        e.preventDefault();
        this.saveModel();
    }

    saveModel() {
        // FIXME: @benoitg Where is formType supposed to come from?
        // Nowhere in the code
        if (false && !this.formType) {
            console.log("Cannot continue. Form is incomplete.");
            var er = i18n.gettext(
                "Please select a destination to export to before continuing"
            );
            $(".js_export_error_message").text(er);
        } else if (!this.fbView) {
            var er = i18n.gettext("Please complete facebook login");
            $(".js_export_error_message").text(er);
        } else {
            var that = this;
            //console.log('currentView', this.currentView);
            this.fbView.saveModel(
                function () {
                    Ctx.clearModal();
                },
                function (msg) {
                    that.$(".js_export_error_message").text(msg);
                    console.error("Could not save model in basefbView");
                }
            );
        }
    }

    onDestroy() {
        this.vent.off("reloadBase");
    }
}

export default {
    init: basefbView,
};
