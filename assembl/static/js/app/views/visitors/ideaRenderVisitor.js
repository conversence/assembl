/**
 *
 * @module app.views.visitors.ideaRenderVisitor
 */

import Visitor from "./visitor.js";

/** A visitor function to be passed to to a visit function such as
 * Idea.visitBreadthFirst or MessageCollection.visitDepthFirst
 *
 * @param data_by_object: output param, dict containing for each object traversed the
 *    render information indexed by the object id.  See the data variable inside
 *    the function body for definition of the structure
 * @param order_lookup_table output param, a list containing every object id retained
 * indexed by traversal order
 * @param roots: output param. The objects that have no parents in the set
 * @param filter_function:  The object is passed to this callback.  If it returns:
 *  - false the object won't be part of the returned set.
 *  - 0 instead of false, all descendants of the object will also be excluded
 */
var IdeaRenderVisitor = function (
    data_by_object,
    order_lookup_table,
    roots,
    filter_function
) {
    this.data_by_object = data_by_object;
    this.order_lookup_table = order_lookup_table;
    this.roots = roots;
    if (filter_function === undefined) {
        filter_function = function (node) {
            return true;
        };
    }

    this.filter_function = filter_function;
};

IdeaRenderVisitor.prototype = new Visitor();

IdeaRenderVisitor.prototype.visit = function (object, ancestry) {
    var data_by_object = this.data_by_object;
    var order_lookup_table = this.order_lookup_table;
    var filter_result = this.filter_function(object);
    if (filter_result) {
        var object_id = object.getId();
        var level = 0;
        var in_ancestry = true;
        var ancestor_id;
        var last_ancestor_id = null;
        var link;
        var last_link = null;
        var true_sibling = true;

        for (var i in ancestry) {
            link = ancestry[i];
            var ancestor_id = link.get("source");
            var ancestor = object.collection.get(ancestor_id);
            if (!ancestor) {
                // in synthesis, not all ancestors present
                continue;
            }

            in_ancestry = data_by_object.hasOwnProperty(ancestor_id);
            if (in_ancestry) {
                level++;
                last_ancestor_id = ancestor_id;
                last_link = link;
            }
        }

        if (last_ancestor_id != null) {
            var brothers = data_by_object[last_ancestor_id]["children"];
            if (brothers.length > 0) {
                var last_brother = brothers[brothers.length - 1];
                true_sibling =
                    last_brother.get("parentId") == object.get("parentId");
                data_by_object[last_brother.getId()]["is_last_sibling"] = false;
            }

            brothers.push(object);
        } else {
            this.roots.push(object);
        }

        var data = {
            "@id": object_id,
            object: object,
            level: level,
            real_ancestor_count: ancestry.length,
            skip_parent: (level != 0) & !in_ancestry,
            is_last_sibling: true,
            true_sibling: true_sibling,
            children: [],
            last_ancestor_id: last_ancestor_id,
            last_link: link,
            traversal_order: order_lookup_table.length,
        };
        data_by_object[object_id] = data;
        order_lookup_table.push(object_id);
    }

    // This allows you to return 0 vs false and cut recursion short.
    //benoitg:  map, this has no effect anymore right?
    return filter_result !== 0;
};

IdeaRenderVisitor.prototype.post_visit = function (object, children_data) {
    return {};
};

export default IdeaRenderVisitor;
