/**
 *
 * @module app.views.visitors.ideaSiblingChainVisitor
 */

import Visitor from "./visitor.js";

/** Generates the last_sibbling_chains for ideas, in the following structure:
 * data_by_idea[visited_idea_id]['last_sibling_chain'][for_each_level_is_the_parent_a_last_sibbling]
 * Assumes data_by_idea was previously filled by an IdeaRenderVisitor
 * Generates a visitor function to be passed to to a visit function such as
 * Idea.visitBreadthFirst
 * data_by_idea: input/output param, dict containing for each idea traversed the
 *    render information indexed by the idea id.
 */
var IdeaSiblingChainVisitor = function (data_by_idea) {
    this.data_by_idea = data_by_idea;
};

IdeaSiblingChainVisitor.prototype = new Visitor();

IdeaSiblingChainVisitor.prototype.visit = function (idea, ancestry) {
    var idea_id = idea.getId();
    var data_by_idea = this.data_by_idea;
    if (data_by_idea.hasOwnProperty(idea_id)) {
        var level = 0;
        var in_ancestry = true;
        var link;
        var ancestor_id;
        var last_ancestor_id = null;
        var last_sibling_chain = [];
        for (var i in ancestry) {
            link = ancestry[i];
            ancestor_id = link.get("source");
            if (data_by_idea.hasOwnProperty(ancestor_id)) {
                last_sibling_chain.push(
                    data_by_idea[ancestor_id]["is_last_sibling"]
                );
            }
        }

        data_by_idea[idea_id]["last_sibling_chain"] = last_sibling_chain;
    }

    return true;
};

export default IdeaSiblingChainVisitor;
