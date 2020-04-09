/**
 * The link between two ideas
 * @module app.models.ideaLink
 */
import _ from "underscore";

import Base from "./base.js";
import Ctx from "../common/context.js";

/**
 * Idea link model
 * Frontend model for :py:class:`assembl.models.idea.IdeaLink`
 * @class app.models.ideaLink.IdeaLinkModel
 * @extends app.models.base.BaseModel
 */
class IdeaLinkModel extends Base.Model.extend({
    /**
     * Defaults
     * @type {Object}
     */
    defaults: {
        source: "",
        target: "",
        original_uri: null,
        is_tombstone: false,
        subtype: "DirectedIdeaRelation",
        order: 1,
    },
}) {
    /**
     * @function app.models.ideaLink.IdeaLinkModel.initialize
     */
    initialize(obj) {
        obj = obj || {};
        var that = this;
    }

    /**
     * Validate the model attributes
     * @function app.models.ideaLink.IdeaLinkModel.validate
     */
    validate(attrs, options) {
        /**
         * check typeof variable
         * */
    }
}

/**
 * Idea link collection
 * @class app.models.ideaLink.IdeaLinkCollection
 * @extends app.models.base.BaseCollection
 */
class IdeaLinkCollection extends Base.Collection.extend({
    /**
     * The model
     * @type {IdeaLinkModel}
     */
    model: IdeaLinkModel,

    /**
     * @member {string} app.models.ideaLink.IdeaLinkCollection.url
     */
    url: Ctx.getApiV2DiscussionUrl("idea_links"),
}) {}

export default {
    Model: IdeaLinkModel,
    Collection: IdeaLinkCollection,
};
