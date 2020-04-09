/**
 *
 * @module app.views.groups.groupContainer
 */

import $ from "jquery";
import Marionette from "backbone.marionette";
import ctx from "../../common/context.js";
import IdeaLoom from "../../app.js";
import GroupContent from "./groupContent.js";
import BasePanel from "../basePanel.js";
import PanelSpecTypes from "../../utils/panelSpecTypes.js";

/**
 * Manages all the groups in the interface, essentially the GroupSpec.Collection
 * Normally referenced with IdeaLoom.groupContainer
 *
 * @class app.views.groups.groupContainer.groupContainer
 */
class groupContainer extends Marionette.CollectionView.extend({
    className: "groupsContainer",
    childView: GroupContent,
    group_borders_size: 0,
    resizeSuspended: false,
    minPanelSize: BasePanel.prototype.minimized_size,
}) {
    onRender() {
        var that = this;
        that.resizeAllPanels(true);
        $(window).on("resize", function () {
            that.resizeAllPanels(true);
        });
    }

    resizeAllPanels(skipAnimation) {
        var that = this;
        var screenSize = window.innerWidth;
        var animationDuration = 1000;
        this.children.each(function (groupContentView) {
            groupContentView.body.children.each(function (panelWrapperView) {
                var panelMinWidth = panelWrapperView.model.get("minWidth");
                var isPanelMinimized = panelWrapperView.model.get("minimized");
                var panelWidth = that.getPanelWidth(
                    panelMinWidth,
                    isPanelMinimized
                );
                var panel = panelWrapperView.$el;
                if (skipAnimation) {
                    panel.stop(true, true); // kill animations that were created during previous calls of this.resizeAllPanels(true), so that the final position width is the one computed during the lastest function call, instead of during the callback of the animation (this occurs when a resizeAllPanels(true) call preceeds a resizeAllPanels(false) call)
                    panel.css({ "min-width": panelMinWidth });
                    panel.width(panelWidth);
                } else {
                    var totalMinWidth = that.getTotalMinWidth();
                    if (totalMinWidth < screenSize) {
                        panel.css({ "min-width": 0 });
                        panel.animate(
                            { width: panelWidth },
                            animationDuration,
                            "swing",
                            function () {
                                panel.css({ "min-width": panelMinWidth });
                            }
                        );
                    } else {
                        var isSmallScreen = Ctx.isSmallScreen();
                        if (isSmallScreen) {
                            panel.animate(
                                { "min-width": panelMinWidth },
                                animationDuration,
                                "swing"
                            );
                        } else {
                            panel.css({ "min-width": 0 });
                            panel.animate(
                                { width: panelMinWidth },
                                animationDuration,
                                "swing",
                                function () {
                                    panel.css({ "min-width": panelMinWidth });
                                }
                            );
                        }
                    }
                }
            });
        });
    }

    getPanelWidth(panelMinWidth, isPanelMinimized) {
        var screenSize = window.innerWidth;
        var panelWIdth = 0;
        if (isPanelMinimized) {
            panelWIdth = this.minPanelSize;
        } else {
            var isSmallScreen = ctx.isSmallScreen();
            if (!isSmallScreen) {
                var totalMinWidth = this.getTotalMinWidth();
                var panelWidthInPercent = (panelMinWidth * 100) / totalMinWidth;
                var totalMinimized = this.getTotalWidthMinimized();
                var panelWidthInPixel =
                    (panelWidthInPercent * (screenSize - totalMinimized)) / 100;
                panelWIdth = panelWidthInPixel;
            } else {
                panelWIdth = screenSize;
            }
        }
        return panelWIdth;
    }

    getTotalMinWidth() {
        var totalMinWidth = 0;
        this.children.each(function (groupContentView) {
            groupContentView.body.children.each(function (panelWrapperView) {
                var isPanelMinimized = panelWrapperView.model.get("minimized");
                var isPanelHidden = panelWrapperView.model.get("hidden");
                if (!isPanelHidden) {
                    if (!isPanelMinimized) {
                        totalMinWidth += panelWrapperView.model.get("minWidth");
                    }
                }
            });
        });
        return totalMinWidth;
    }

    getTotalWidthMinimized() {
        var that = this;
        var totalMinimized = 0;
        this.children.each(function (groupContentView) {
            groupContentView.body.children.each(function (panelWrapperView) {
                var isPanelMinimized = panelWrapperView.model.get("minimized");
                var isPanelHidden = panelWrapperView.model.get("hidden");
                if (!isPanelHidden) {
                    if (isPanelMinimized) {
                        totalMinimized += that.minPanelSize;
                    }
                }
            });
        });
        return totalMinimized;
    }

    /**
     * @param view: A view (such as a messageList) for
     * which we want the matching groupContent to send events or manipulate
     * state.
     *
     * @return: A groupContent view
     */
    getGroupContent(view) {
        console.log("getGroupContent(): WRITEME!");
    }

    /**
     *  NOT YET TESTED - benoitg- 2015-06-29
     * @param viewClass: A view (such as a messageList) for
     * which we want the matching groupContent to send events or manipulate
     * state.
     * @returns Possibly empty array of panels
     */
    findGroupsWithPanelInstance(panelSpecType) {
        if (!panelSpecType) panelSpecType = PanelSpecTypes.MESSAGE_LIST;
        var groups = [];
        var group = this.children.each(function (group) {
            var requested_panel = group.findViewByType(panelSpecType);
            if (requested_panel) {
                groups.push(group);
            }
        });
        return groups;
    }

    childViewOptions(child) {
        return {
            groupContainer: this,
        };
    }

    /** Does this group have exactly one navigation panel?
     *
     */
    isOneNavigationGroup() {
        if (this.collection.size() == 1) {
            var group1 = this.collection.first();
            var panel_types = group1.get("panels").pluck("type");
            if (
                panel_types.length == 3 &&
                (PanelSpecTypes.getByRawId(panel_types[0]) ===
                    PanelSpecTypes.NAV_SIDEBAR ||
                    PanelSpecTypes.getByRawId(panel_types[0]) ===
                        PanelSpecTypes.TABLE_OF_IDEAS) &&
                //I don't think this code is correct anymore.   Why do we check that
                //there is an idea panel followed by a messagelist? benoitg- 2015-05-27
                PanelSpecTypes.getByRawId(panel_types[1]) ===
                    PanelSpecTypes.IDEA_PANEL &&
                PanelSpecTypes.getByRawId(panel_types[2]) ===
                    PanelSpecTypes.MESSAGE_LIST
            )
                return true;
        }
        return false;
    }
}

export default groupContainer;
