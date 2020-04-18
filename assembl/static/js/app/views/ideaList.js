/**
 *
 * @module app.views.ideaList
 */

import $ from "jquery";
import Promise from "bluebird";
import _ from "underscore";
import Backbone from "backbone";
import Marionette from "backbone.marionette";

import AllMessagesInIdeaListView from "./allMessagesInIdeaList.js";
import OrphanMessagesInIdeaListView from "./orphanMessagesInIdeaList.js";
import SynthesisInIdeaListView from "./synthesisInIdeaList.js";
import Loader from "./loader.js";
import Permissions from "../utils/permissions.js";
import IdeaRenderVisitor from "./visitors/ideaRenderVisitor.js";
import IdeaSiblingChainVisitor from "./visitors/ideaSiblingChainVisitor";
import IdeaLoom from "../app.js";
import Ctx from "../common/context.js";
import Idea from "../models/idea.js";
import UserCustomData from "../models/userCustomData.js";
import ideaInIdeaList from "./ideaInIdeaList.js";
import PanelSpecTypes from "../utils/panelSpecTypes.js";
import scrollUtils from "../utils/scrollUtils.js";
import BasePanel from "./basePanel.js";
import CollectionManager from "../common/collectionManager.js";
import i18n from "../utils/i18n.js";
import OtherInIdeaListView from "./otherInIdeaList.js";
import Analytics from "../internal_modules/analytics/dispatcher.js";
import DiscussionPreference from "../models/discussionPreference.js";

var FEATURED = "featured";
var IN_SYNTHESIS = "inNextSynthesis";

class AddIdeaButton extends Marionette.View.extend({
    template: _.template(
        '<% if (mayAdd) { %><a href="#" class="js_ideaList-addbutton btn btn-default btn-sm ' +
            '<% if (!canAddHere) { print("is-disabled") } %>"><i class="icon-add-2"></i>' +
            i18n.gettext("Add idea") +
            "</a> &nbsp;&nbsp;<% } %>"
    ),
    ui: {
        addIdeaButton: ".js_ideaList-addbutton",
    },
    events: {
        "click @ui.addIdeaButton": "onClick",
    },
}) {
    serializeData() {
        const ideaList = this.options.ideaList;
        const allIdeasCollection = ideaList.allIdeasCollection;
        const user = Ctx.getCurrentUser();
        const currentIdea =
            ideaList.getGroupState().get("currentIdea") ||
            (allIdeasCollection ? allIdeasCollection.getRootIdea() : null);
        return {
            canAddHere:
                currentIdea && currentIdea.userCan(Permissions.ADD_IDEA),
            mayAdd:
                user.can(Permissions.ADD_IDEA) ||
                (allIdeasCollection &&
                    allIdeasCollection.allExtraUserPermissions()[
                        Permissions.ADD_IDEA
                    ]),
        };
    }
    onClick(ev) {
        this.options.ideaList.addChildToSelected(ev);
    }
}

class IdeaList extends BasePanel.extend({
    template: "#tmpl-ideaList",
    panelType: PanelSpecTypes.TABLE_OF_IDEAS,
    className: "ideaList",

    regions: {
        ideaView: ".ideaView",
        addIdeaButton: ".idealist-add-idea-button",
        otherView: ".otherView",
        synthesisView: ".synthesisView",
        orphanView: ".orphanView",
        allMessagesView: ".allMessagesView",
    },

    /**
     * .panel-body
     */
    body: null,

    mouseRelativeY: null,
    mouseIsOutside: null,
    scrollableElement: null,
    scrollableElementHeight: null,
    lastScrollTime: null,
    scrollInterval: null,
    scrollLastSpeed: null,

    // must match $tableOfIdeasRowHeight in _variables.scss
    tableOfIdeasRowHeight: 36,

    // must match the presence of .idealist-children { font-size: 98.5%; } in _variables.scss
    tableOfIdeasFontSizeDecreasingWithDepth: true,

    /**
     * Stores (in UserCustomData per-discussion key/value store) the collapsed state of each idea, as saved by user when he expands or collapses an idea. Model is in the following form: {42: true, 623: false} where each key is the numeric id of an idea
     * @type {UserCustomData.Model}
     */
    tableOfIdeasCollapsedState: null,

    /**
     * Stores (in DiscussionPreference per-discussion key/value store) the default collapsed state of each idea, as saved by harvesters. Model is in the following form: {42: true, 623: false} where each key is the numeric id of an idea
     * @type {DiscussionPreference.Model}
     */
    defaultTableOfIdeasCollapsedState: null,

    /**
     * Are we showing the graph or the list?
     * @type {boolean}
     */
    show_graph: false,

    minWidth: 320,
    gridSize: BasePanel.prototype.NAVIGATION_PANEL_GRID_SIZE,

    ui: {
        panelBody: ".panel-body",
        collapseButton: "#ideaList-collapseButton",
        closeButton: "#ideaList-closeButton",
        filterByFeatured: "#ideaList-filterByFeatured",
        filterByInNextSynthesis: "#ideaList-filterByInNextSynthesis",
        filterByToc: "#ideaList-filterByToc",
        decreaseRowHeight: ".js_decreaseRowHeight",
        increaseRowHeight: ".js_increaseRowHeight",
        toggleDecreasingFontSizeWithDepth:
            ".js_toggleDecreasingFontSizeWithDepth",
        saveIdeasStateAsDefault: ".js_saveIdeasStateAsDefault",
        restoreIdeasState: ".js_restoreIdeasState",
        expandAllIdeas: ".js_expandAllIdeas",
        collapseAllIdeas: ".js_collapseAllIdeas",
    },

    events: {
        "click @ui.panelBody": "onPanelBodyClick",

        "click @ui.collapseButton": "toggleIdeas",
        "click @ui.closeButton": "closePanel",

        "click @ui.filterByFeatured": "filterByFeatured",
        "click @ui.filterByInNextSynthesis": "filterByInNextSynthesis",
        "click @ui.filterByToc": "clearFilter",

        "click @ui.decreaseRowHeight": "decreaseRowHeight",
        "click @ui.increaseRowHeight": "increaseRowHeight",
        "click @ui.toggleDecreasingFontSizeWithDepth":
            "toggleDecreasingFontSizeWithDepth",
        "click @ui.saveIdeasStateAsDefault": "saveIdeasStateAsDefault",
        "click @ui.restoreIdeasState": "restoreIdeasState",
        "click @ui.expandAllIdeas": "expandAllIdeas",
        "click @ui.collapseAllIdeas": "collapseAllIdeas",
    },
}) {
    /**
     * Is this panel the primary navigation panel for it's group?
     * @returns true or false
     */
    isPrimaryNavigationPanel() {
        //TODO:  This overrides parent class, but will not always be true
        return true;
    }

    initialize(options) {
        this.setLoading(true);
        super.initialize(...arguments);
        var that = this;
        var collectionManager = new CollectionManager();

        //Variable used to check the position of the ideaList upon re-renders
        this.bodyTopPosition = 0;

        var requestRender = function () {
            setTimeout(function () {
                if (!that.isDestroyed()) {
                    //console.log("Render from ideaList requestRender");
                    that.render();
                }
            }, 1);
        };

        this.defaultTableOfIdeasCollapsedState = new DiscussionPreference.DictModel(
            {
                id: "default_table_of_ideas_collapsed_state",
            }
        );
        var defaultTableOfIdeasCollapsedStateFetchPromise = this.defaultTableOfIdeasCollapsedState.fetch();

        var groupContent = this.getContainingGroup();
        var tableOfIdeasCollapsedStateKey =
            groupContent.getGroupStoragePrefix() +
            "_table_of_ideas_collapsed_state";
        this.tableOfIdeasCollapsedState = new UserCustomData.Model({
            id: tableOfIdeasCollapsedStateKey,
        });
        var tableOfIdeasCollapsedStateFetchPromise = Ctx.isUserConnected()
            ? this.tableOfIdeasCollapsedState.fetch()
            : Promise.resolve(true);

        Promise.join(
            collectionManager.getAllIdeasCollectionPromise(),
            collectionManager.getAllIdeaLinksCollectionPromise(),
            tableOfIdeasCollapsedStateFetchPromise,
            defaultTableOfIdeasCollapsedStateFetchPromise, // now that we have the collapsed state of each idea, we can (re)render the table of ideas
            collectionManager.getUserLanguagePreferencesPromise(Ctx),
            function (
                allIdeasCollection,
                allIdeaLinksCollection,
                collapsedState,
                defaultCollapsedState,
                translationData
            ) {
                if (!that.isDestroyed()) {
                    var events = [
                        "reset",
                        "change:parentId",
                        "change:@id",
                        "change:hidden",
                        "remove",
                        "add",
                        "destroy",
                    ];
                    that.listenTo(
                        allIdeasCollection,
                        events.join(" "),
                        requestRender
                    );
                    that.allIdeasCollection = allIdeasCollection;

                    var events = [
                        "reset",
                        "change:source",
                        "change:target",
                        "change:order",
                        "remove",
                        "add",
                        "destroy",
                    ];
                    that.listenTo(
                        allIdeaLinksCollection,
                        events.join(" "),
                        requestRender
                    );
                    that.allIdeaLinksCollection = allIdeaLinksCollection;
                    that.translationData = translationData;
                    that.setLoading(false);
                    that.render();
                }
            }
        );

        if (!this.isDestroyed()) {
            //Yes, it IS possible the view is already destroyed in initialize, so we check
            this.listenTo(IdeaLoom.idea_vent, "ideaList:removeIdea", function (
                idea
            ) {
                if (!that.isDestroyed()) {
                    that.removeIdea(idea);
                }
            });

            this.listenTo(
                IdeaLoom.idea_vent,
                "ideaList:addChildToSelected",
                function () {
                    if (!that.isDestroyed()) {
                        that.addChildToSelected();
                    }
                }
            );

            this.listenTo(IdeaLoom.idea_vent, "idea:dragOver", function () {
                that.mouseIsOutside = false;
            });
            this.listenTo(IdeaLoom.idea_vent, "idea:dragStart", function () {
                that.lastScrollTime = new Date().getTime();
                that.scrollLastSpeed = 0;
                that.scrollableElement = that.$(".panel-body");

                //console.log("that.scrollableElement: ", that.scrollableElement);
                that.scrollableElementHeight = that
                    .$(".panel-body")
                    .outerHeight();
                that.scrollInterval = setInterval(function () {
                    that.scrollTowardsMouseIfNecessary();
                }, 10);
            });
            this.listenTo(IdeaLoom.idea_vent, "idea:dragEnd", function () {
                clearInterval(that.scrollInterval);
                that.scrollInterval = null;
            });

            this.listenTo(
                IdeaLoom.idea_vent,
                "DEPRECATEDideaList:selectIdea",
                function (ideaId, reason, doScroll) {
                    collectionManager
                        .getAllIdeasCollectionPromise()
                        .done(function (allIdeasCollection) {
                            if (that.isDestroyed()) {
                                return;
                            }
                            var idea = allIdeasCollection.get(ideaId);
                            function success(idea) {
                                that.getContainingGroup().setCurrentIdea(idea);
                                if (doScroll) that.onScrollToIdea(idea);
                            }
                            if (idea) {
                                success(idea);
                            } else {
                                // maybe a tombstone
                                idea = new Idea.Model({ "@id": ideaId });
                                idea.collection = allIdeasCollection;
                                idea.fetch({
                                    success: function (
                                        model,
                                        response,
                                        options
                                    ) {
                                        ideaId = model.get("original_uri");
                                        idea = allIdeasCollection.get(ideaId);
                                        if (idea) {
                                            success(idea);
                                        }
                                    },
                                });
                            }
                        });
                }
            );

            // This seems to never be triggered.
            this.listenTo(this, "scrollToIdea", this.onScrollToIdea);

            this.listenTo(this.getGroupState(), "change:currentIdea", function (
                state,
                currentIdea
            ) {
                //console.log("ideaList heard a change:currentIdea event");
                if (currentIdea && !that.isDestroyed()) {
                    that.onScrollToIdea(currentIdea);
                    that.getRegion("addIdeaButton").currentView.render();
                }
            });

            $("html").on("dragover", function (e) {
                that.onDocumentDragOver(e);
            });
        }
    }

    serializeData() {
        const user = Ctx.getCurrentUser();
        const currentIdea =
            this.getGroupState().get("currentIdea") ||
            (this.allIdeasCollection
                ? this.allIdeasCollection.getRootIdea()
                : null);
        return {
            canAdd: currentIdea && currentIdea.userCan(Permissions.ADD_IDEA),
            canAdmin: user.can(Permissions.ADMIN_DISCUSSION),
            maybeCanAdd:
                user.can(Permissions.ADD_IDEA) ||
                (this.allIdeasCollection &&
                    this.allIdeasCollection.allExtraUserPermissions()[
                        Permissions.ADD_IDEA
                    ]),
        };
    }

    getTitle() {
        return i18n.gettext("Table of ideas");
    }

    getTableOfIdeasCollapsedState() {
        return this.tableOfIdeasCollapsedState;
    }

    getDefaultTableOfIdeasCollapsedState() {
        return this.defaultTableOfIdeasCollapsedState;
    }

    render() {
        //Overriding render because getting the scrollTop position of the ideaList body container
        //is lost upon re-rendering. BeforeRender and onRender are too late.
        if (Ctx.debugRender) {
            console.log("Render is called");
        }
        this.body = this.$(".panel-body");
        if (this.body.get(0)) {
            var scrollTop = this.body.get(0).scrollTop;
            if (scrollTop !== 0) {
                if (Ctx.debugRender) {
                    console.log("ScrollTop is non-zero. Setting it.");
                }
                this.bodyTopPosition = scrollTop;
            }
            if (Ctx.debugRender) {
                console.log("before scrollTop:" + this.bodyTopPosition);
            }
        }
        super.render(...arguments);
    }

    onRender() {
        if (Ctx.debugRender) {
            console.log("ideaList:render() is firing");
        }

        Ctx.removeCurrentlyDisplayedTooltips(this.$el);
        this.body = this.$(".panel-body");
        var that = this;
        var rootIdea = null;
        var rootIdeaDirectChildrenModels = [];
        var filter = {};
        var view_data = {};
        var order_lookup_table = [];
        var roots = [];
        var collectionManager = new CollectionManager();

        function excludeRoot(idea) {
            return idea != rootIdea && !idea.hidden;
        }

        if (!this.isLoading()) {
            var analytics = Analytics.getInstance();
            analytics.trackEvent(
                analytics.events.NAVIGATION_OPEN_DEBATE_SECTION
            );
            if (!this.allIdeasCollection || !this.allIdeaLinksCollection) {
                throw new Error(
                    "loader has been cleared, but ideas aren't available yet"
                );
            }

            if (this.filter === FEATURED) {
                filter.featured = true;
            } else if (this.filter === IN_SYNTHESIS) {
                filter.inNextSynthesis = true;
            }

            var list = document.createDocumentFragment();

            rootIdea = this.allIdeasCollection.getRootIdea();
            if (Object.keys(filter).length > 0) {
                rootIdeaDirectChildrenModels = this.allIdeasCollection.where(
                    filter
                );
            } else {
                rootIdeaDirectChildrenModels = this.allIdeasCollection.models;
            }

            rootIdeaDirectChildrenModels = rootIdeaDirectChildrenModels.filter(
                function (idea) {
                    return (
                        idea.get("parentId") == rootIdea.id ||
                        (idea.get("parentId") == null && idea.id != rootIdea.id)
                    );
                }
            );

            rootIdeaDirectChildrenModels = _.sortBy(
                rootIdeaDirectChildrenModels,
                function (idea) {
                    return idea.get("order");
                }
            );

            this.allIdeasCollection.visitDepthFirst(
                this.allIdeaLinksCollection,
                new IdeaRenderVisitor(
                    view_data,
                    order_lookup_table,
                    roots,
                    excludeRoot
                )
            );
            this.allIdeasCollection.visitDepthFirst(
                this.allIdeaLinksCollection,
                new IdeaSiblingChainVisitor(view_data)
            );

            this.addLabelToMostRecentIdeas(this.allIdeasCollection, view_data);

            that.showChildView("ideaView", new Loader());
            that.showChildView(
                "addIdeaButton",
                new AddIdeaButton({ ideaList: that })
            );

            //console.log("About to set ideas on ideaList",that.cid, "with panelWrapper",that.getPanelWrapper().cid, "with group",that.getContainingGroup().cid);

            var ideaFamilies = new ideaInIdeaList.IdeaFamilyCollectionView({
                collection: new Backbone.Collection(roots),
                options: {
                    translationData: that.translationData,
                },
            });
            ideaFamilies.childViewOptions = {
                parentPanel: that,
                groupContent: that.getContainingGroup(),
                visitorData: view_data,
                translationData: that.translationData,
            };

            that.showChildView("ideaView", ideaFamilies);

            Ctx.initTooltips(that.$el);
            if (Ctx.debugRender) {
                console.log(
                    "Restoring scroll position to ",
                    that.bodyTopPosition
                );
            }
            that.body = that.$(".panel-body");
            that.body.scrollTop(that.bodyTopPosition);

            //sub menu other
            var OtherView = new OtherInIdeaListView({
                model: rootIdea,
                parentPanel: that,
                translationData: that.translationData,
                groupContent: that.getContainingGroup(),
            });
            that.showChildView("otherView", OtherView);

            // Synthesis posts pseudo-idea
            var synthesisView = new SynthesisInIdeaListView({
                model: rootIdea,
                parentPanel: that,
                translationData: that.translationData,
                groupContent: that.getContainingGroup(),
            });
            that.showChildView("synthesisView", synthesisView);

            // Orphan messages pseudo-idea
            var orphanView = new OrphanMessagesInIdeaListView({
                model: rootIdea,
                parentPanel: that,
                translationData: that.translationData,
                groupContent: that.getContainingGroup(),
            });
            that.showChildView("orphanView", orphanView);

            // All posts pseudo-idea
            var allMessagesInIdeaListView = new AllMessagesInIdeaListView({
                model: rootIdea,
                parentPanel: that,
                translationData: that.translationData,
                groupContent: that.getContainingGroup(),
            });
            that.showChildView("allMessagesView", allMessagesInIdeaListView);
            IdeaLoom.tour_vent.trigger("requestTour", "idea_list");
        }
    }

    /**
     * Add a "new" label to most recent ideas
     * @param ideas: collection of ideas. For example: this.allIdeasCollection
     * @param view_data: object which will be modified during the traversal
     */
    addLabelToMostRecentIdeas(ideas, view_data) {
        var maximum_ratio_of_highlighted_ideas = 1.0; // this is a float and should be in [0;1]. was 0.2
        var should_be_newer_than = null;

        // Rule: Show new labels on ideas created after 3 days before user's last visit, or created after 4 days ago if user's last visit was after yesterday
        if (Ctx.isUserConnected()) {
            var last_visit = Ctx.getCurrentUser().get("last_visit");
            if (last_visit) {
                last_visit = new Date(last_visit);
                if (last_visit) {
                    var yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1); // sets to x days before
                    if (last_visit < yesterday) {
                        should_be_newer_than = last_visit;
                        should_be_newer_than.setDate(
                            should_be_newer_than.getDate() - 3
                        ); // sets to x days before
                    } else {
                        // TODO: look for the antepenultimate visit, but we don't store it yet
                        should_be_newer_than = yesterday;
                        should_be_newer_than.setDate(
                            should_be_newer_than.getDate() - 3
                        ); // sets to x days before
                    }
                }
            }
        }

        // Rule: Never consider as new an idea which has been created before user's first visit (so this also applies to not logged-in visitors)
        var first_visit = Ctx.getCurrentUser().get("first_visit");
        if (first_visit) {
            first_visit = new Date(first_visit);
            if (first_visit) {
                if (
                    !should_be_newer_than ||
                    should_be_newer_than < first_visit
                ) {
                    should_be_newer_than = first_visit;
                }
            }
        }
        if (!should_be_newer_than) {
            return;
            /* We used to show new labels on ideas less than 1 month old to not logged-in users and to logged-in users who are on their first visit. Now we don't show any new label to not logged-in users, and first visit logged-in users are now handled by previous code block.
      should_be_newer_than = new Date();
      should_be_newer_than.setMonth(should_be_newer_than.getMonth() - 1); // sets to x months before
      */
        }

        //console.log("should_be_newer_than: ", should_be_newer_than);

        var idea_criterion_value = function (idea) {
            return new Date(idea.get("created"));
        };
        var creation_dates = ideas.map(idea_criterion_value); // create a list of idea creation dates
        var date_sort_asc = function (date1, date2) {
            if (date1 > date2) return 1;
            if (date1 < date2) return -1;
            return 0;
        };
        creation_dates.sort(date_sort_asc);

        // console.log("creation_dates: ", creation_dates);
        var sz = creation_dates.length;
        // console.log("sz: ", sz);
        var index = null;
        var highlight_if_newer_than = null;
        if (sz > 2) {
            index = Math.floor(
                (sz - 1) * (1 - maximum_ratio_of_highlighted_ideas)
            );
            // console.log("index1: ", index);
            do {
                if (creation_dates[index] >= should_be_newer_than) {
                    break;
                }
                ++index;
            } while (index < sz);
            // console.log("index2: ", index);
            if (index < sz) {
                // TODO: go backwards to find ideas which have been created during the same short period of time (day?) as this one, but then check we are still validating maximum_ratio_of_highlighted_ideas, otherwise just keep this one (or go forward until an idea is not in this same short period of time anymore)

                //view_data["highlight_if_newer_than"] = creation_dates[index];
                highlight_if_newer_than = creation_dates[index];
                console.log(
                    "we are going to highlight ideas which have been created after: ",
                    highlight_if_newer_than
                );
            }
        }
        ideas.each(function (idea) {
            var crierion_value = idea_criterion_value(idea);
            if (
                highlight_if_newer_than &&
                crierion_value &&
                crierion_value >= highlight_if_newer_than
            ) {
                var idea_id = idea.getId();
                //console.log("we are going to highlight idea: ", idea_id, idea.get("shortTitle").bestValue(that.translationData));
                if (!(idea_id in view_data)) {
                    view_data[idea_id] = {};
                }
                view_data[idea_id]["showLabel"] = "new";
            }
        });
        // console.log("view_data: ", view_data);
    }

    onScrollToIdea(ideaModel, retry) {
        if (Ctx.debugRender) {
            console.log("ideaList::onScrollToIdea()");
        }
        var that = this;
        if (ideaModel) {
            if (ideaModel.id) {
                var el = this.$el.find("." + ideaModel.getCssClassFromId());
                if (el.length) {
                    scrollUtils.scrollToElement(
                        el.first(),
                        null,
                        10,
                        true,
                        false
                    );
                } else {
                    console.log("el not found, will retry later");
                    if (retry == undefined) retry = 0;
                    if (++retry < 5)
                        setTimeout(function () {
                            that.onScrollToIdea(ideaModel, retry);
                        }, 200);
                }
            } else {
                // idea has no id yet, so we will wait until it has one to then be able to compare its model to ours
                console.log(
                    "idea has no id yet, so we will wait until it has one to then be able to compare its model to ours"
                );
                that.listenToOnce(ideaModel, "acquiredId", function () {
                    that.onScrollToIdea(ideaModel);
                });
            }
        }
    }

    /**
     * Remove the given idea
     * @param  {Idea} idea
     */
    removeIdea(idea) {
        var parent = idea.get("parent");

        if (parent) {
            parent.get("children").remove(idea);
        } else {
            console.error(
                " This shouldn't happen, only th root idea has no parent"
            );
        }
    }

    /**
     * Collapse ALL ideas
     */
    collapseIdeas() {
        var collectionManager = new CollectionManager();
        var that = this;
        this.collapsed = true;
        collectionManager
            .getAllIdeasCollectionPromise()
            .done(function (allIdeasCollection) {
                allIdeasCollection.each(function (idea) {
                    idea.attributes.isOpen = false;
                });
                that.render();
            });
    }

    /**
     * Expand ALL ideas
     */
    expandIdeas() {
        this.collapsed = false;
        var that = this;
        collectionManager
            .getAllIdeasCollectionPromise()
            .done(function (allIdeasCollection) {
                allIdeasCollection.each(function (idea) {
                    idea.attributes.isOpen = true;
                });
                that.render();
            });
    }

    /**
     * Filter the current idea list by featured
     */
    filterByFeatured() {
        this.filter = FEATURED;
        this.render();
    }

    /**
     * Filter the current idea list by inNextSynthesis
     */
    filterByInNextSynthesis() {
        this.filter = IN_SYNTHESIS;
        this.render();
    }

    /**
     * Clear the filter applied to the idea list
     */
    clearFilter() {
        this.filter = "";
        this.render();
    }

    /**
     * @event
     */
    onPanelBodyClick(ev) {
        if ($(ev.target).hasClass("panel-body")) {
            // We want to avoid the "All messages" state,
            // unless the user clicks explicitly on "All messages".
            // TODO benoitg: Review this decision.
            //this.getContainingGroup().setCurrentIdea(null);
        }
    }

    /**
     * Add a new child to the current selected.
     * If no idea is selected, add it at the root level ( no parent )
     */
    addChildToSelected() {
        var currentIdea = this.getGroupState().get("currentIdea");
        var newIdea = new Idea.Model();
        var that = this;
        var collectionManager = new CollectionManager();

        collectionManager
            .getAllIdeasCollectionPromise()
            .then(function (allIdeasCollection) {
                var order;
                if (allIdeasCollection.get(currentIdea)) {
                    order = currentIdea.getOrderForNewChild();
                    newIdea.set("order", order);
                    currentIdea.addChild(newIdea);
                } else {
                    order = allIdeasCollection.getOrderForNewRootIdea();
                    newIdea.set("order", order);
                    allIdeasCollection.add(newIdea);

                    newIdea.save(null, {
                        success: function (model, resp) {
                            model.onIdeaCreated();
                        },
                        error: function (model, resp) {
                            console.error("ERROR: addChildToSelected", resp);
                        },
                    });
                }

                that.getContainingGroup().setCurrentIdea(
                    newIdea,
                    false,
                    "created"
                );
            });
    }

    /**
     * Collapse or expand the ideas
     */
    toggleIdeas() {
        if (this.collapsed) {
            this.expandIdeas();
        } else {
            this.collapseIdeas();
        }
    }

    /**
     * Closes the panel
     */
    closePanel() {
        if (this.button) {
            this.button.trigger("click");
        }
    }

    onDocumentDragOver(e) {
        //console.log("onDocumentDragOver");
        if (!Ctx.draggedIdea || !this.scrollableElement) return;
        this.mouseRelativeY =
            e.originalEvent.pageY - this.scrollableElement.offset().top;

        //console.log("this.mouseRelativeY: ", this.mouseRelativeY);
        //console.log("scrollableElementHeight: ", this.scrollableElementHeight);

        // the detection of mouseIsOutside is needed to be done by document also, because when the user is dragging, the mouseleave event is not fired (as the mouse is still on a child)
        if (
            this.mouseRelativeY >= 0 &&
            this.mouseRelativeY <= this.scrollableElementHeight
        ) {
            // cursor is not outside the block
            this.mouseIsOutside = false;
        } else {
            this.mouseIsOutside = true;

            //console.log("isOutside: ", this.mouseIsOutside);
        }
    }

    scrollTowardsMouseIfNecessary() {
        //console.log("scrollTowardsMouseIfNecessary");
        if (!Ctx.draggedIdea || !this.scrollableElement) return;
        if (!this.mouseIsOutside) {
            this.scrollLastSpeed = 0;
            return;
        }

        //console.log("scrollTowardsMouseIfNecessary has enough info");
        var scrollDirectionIsDown =
            this.mouseRelativeY > this.scrollableElementHeight;

        //console.log("scrollDirectionIsDown: ", scrollDirectionIsDown);

        var d;

        var deltaTime;
        d = deltaTime = new Date().getTime();
        if (this.lastScrollTime) deltaTime -= this.lastScrollTime;
        else deltaTime = 10;
        this.lastScrollTime = d;

        var mYn = this.mouseRelativeY;
        if (scrollDirectionIsDown) mYn -= this.scrollableElementHeight;
        var speed = Math.max(0.2, Math.min(40.0, Math.abs(mYn) * 1.0)) * 0.01;

        //console.log("speed: ", speed);
        if (!scrollDirectionIsDown) speed = -speed;
        if (
            (speed > 0 && this.scrollLastSpeed >= 0) ||
            (speed < 0 && this.scrollLastSpeed <= 0)
        )
            speed = this.scrollLastSpeed * 0.8 + speed * 0.2;
        this.scrollLastSpeed = speed;
        //WTF: The parameters of this next line make no sense.
        this.scrollableElement.scrollTop(
            this.scrollableElement.scrollTop() + speed * deltaTime
        );
    }

    increaseRowHeight() {
        this.tableOfIdeasRowHeight += 2;
        this.tableOfIdeasRowHeight = Math.min(
            40,
            Math.max(12, this.tableOfIdeasRowHeight)
        );
        this.updateUserCustomStylesheet();
    }

    decreaseRowHeight() {
        this.tableOfIdeasRowHeight -= 2;
        this.tableOfIdeasRowHeight = Math.min(
            40,
            Math.max(12, this.tableOfIdeasRowHeight)
        );
        this.updateUserCustomStylesheet();
    }

    toggleDecreasingFontSizeWithDepth() {
        this.tableOfIdeasFontSizeDecreasingWithDepth = !this
            .tableOfIdeasFontSizeDecreasingWithDepth;
        this.updateUserCustomStylesheet();
    }

    updateUserCustomStylesheet() {
        var sheetId = "userCustomStylesheet";
        var rowHeight = this.tableOfIdeasRowHeight + "px";
        var rowHeightSmaller = this.tableOfIdeasRowHeight - 2 + "px";

        console.log(
            "current tableOfIdeasRowHeight: ",
            this.tableOfIdeasRowHeight
        );

        // remove sheet if it exists
        var sheetToBeRemoved = document.getElementById(sheetId);
        if (sheetToBeRemoved) {
            var sheetParent = sheetToBeRemoved.parentNode;
            sheetParent.removeChild(sheetToBeRemoved);
        }

        // create sheet
        var sheet = document.createElement("style");
        sheet.id = sheetId;
        var str = ".idealist-item { line-height: " + rowHeight + "; }";
        str += ".idealist-title { line-height: " + rowHeightSmaller + "; }";
        str += ".idealist-title { line-height: " + rowHeightSmaller + "; }";
        str +=
            ".idealist-arrow, .idealist-noarrow, .idealist-space, .idealist-bar, .idealist-link, .idealist-link-last { height: " +
            rowHeight +
            "; }";
        str +=
            "#idealist-list .custom-checkbox { height: " +
            rowHeight +
            "; line-height: " +
            rowHeightSmaller +
            "; }";

        if (this.tableOfIdeasFontSizeDecreasingWithDepth)
            str += ".idealist-children { font-size: 98.5%; }";
        else str += ".idealist-children { font-size: 100%; }";

        sheet.innerHTML = str;
        document.body.appendChild(sheet);
    }

    // called by ideaInIdeaList::saveCollapsedState()
    saveIdeaCollapsedState(ideaModel, isCollapsed) {
        if (!Ctx.isUserConnected() || !this.tableOfIdeasCollapsedState) {
            return;
        }
        var idea_numeric_id = ideaModel.getNumericId();
        var value =
            isCollapsed === true || isCollapsed == "true" ? "true" : "false";
        var o = {};
        o[idea_numeric_id] = value;
        this.tableOfIdeasCollapsedState.save(o, { patch: true });
    }

    saveIdeasStateAsDefault() {
        // check first on the front-end that the user has the permission to do this (in order to avoid future failure during API calls)
        if (
            !Ctx.isUserConnected() ||
            !Ctx.getCurrentUser().can(Permissions.ADD_IDEA) ||
            !this.defaultTableOfIdeasCollapsedState
        ) {
            alert(i18n.gettext("You don't have the permission to do this."));
            return;
        }

        // /!\ This algorithm clones the user custom state into the default state.
        // But the user custom state does not define a state on untouched ideas (which are considered open by default).
        // So if one day we change the default state to collapsed, a side effect will be that users will see a different state than the ones which were saved (default and user).
        var attributes = _.clone(this.tableOfIdeasCollapsedState.attributes);
        delete attributes["id"];
        this.defaultTableOfIdeasCollapsedState.set(attributes);
        this.defaultTableOfIdeasCollapsedState.save(null, {
            success: function (model, resp) {
                // maybe we could display a small success
            },
            error: function (model, resp) {
                // I don't know why, but Backbone considers it's an error if the server does not reply by a 200 code, even if it's a 201.
                if ("status" in resp && resp.status == 201) {
                    console.log("this is OK");
                    resp.handled = true; // In order to avoid displaying the IdeaLoom error pop-in
                }
            },
        });
    }

    restoreIdeasState() {
        var id = this.tableOfIdeasCollapsedState.get("id");
        this.tableOfIdeasCollapsedState.clear();
        this.tableOfIdeasCollapsedState.set("id", id);
        if (Ctx.isUserConnected()) {
            this.tableOfIdeasCollapsedState.save(null, {
                success: function (model, resp) {},
                error: function (model, resp) {
                    console.error(
                        "ERROR: could not save ideaList::tableOfIdeasCollapsedState",
                        resp
                    );
                },
            });
        }
        this.render();
        // FIXME: for now, event does not seem to be triggered when I make changes, so I have to call explicitly a render() of the table of ideas
    }

    expandAllIdeas() {
        this.expandOrCollapseAllIdeas(false);
    }

    collapseAllIdeas() {
        this.expandOrCollapseAllIdeas(true);
    }

    /**
     * @param {boolean} collapse: set to true if you want to collapse all ideas, false otherwise
     */
    expandOrCollapseAllIdeas(collapse) {
        var that = this;
        new CollectionManager()
            .getAllIdeasCollectionPromise()
            .done(function (ideas) {
                ideas.each(function (idea) {
                    var id = idea.getNumericId();
                    if (id) {
                        that.tableOfIdeasCollapsedState.set(id, collapse);
                    }
                });
                that.render();
            });
    }
}

export default IdeaList;
