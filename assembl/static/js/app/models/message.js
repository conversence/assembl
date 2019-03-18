/**
 * A message (whether generated on assembl or imported from a ContentSource)
 * @module app.models.message
 */

import _ from 'underscore';

import $ from 'jquery';
import Promise from 'bluebird';
import IdeaLoom from '../app.js';
import Ctx from '../common/context.js';
import Base from './base.js';
import LangString from './langstring.js';
import Types from '../utils/types.js';
import Permissions from '../utils/permissions.js';
import Attachment from './attachments.js';


var PublicationStates = {
  DRAFT: "DRAFT",
  SUBMITTED_IN_EDIT_GRACE_PERIOD: "SUBMITTED_IN_EDIT_GRACE_PERIOD",
  PUBLISHED: "PUBLISHED",
  MODERATED_TEXT_ON_DEMAND: "MODERATED_TEXT_ON_DEMAND",
  MODERATED_TEXT_NEVER_AVAILABLE: "MODERATED_TEXT_NEVER_AVAILABLE",
  DELETED_BY_USER: "DELETED_BY_USER",
  DELETED_BY_ADMIN: "DELETED_BY_ADMIN"
};

var BlockingPublicationStates = {};
BlockingPublicationStates[PublicationStates.MODERATED_TEXT_NEVER_AVAILABLE] = PublicationStates.MODERATED_TEXT_NEVER_AVAILABLE;
BlockingPublicationStates[PublicationStates.DELETED_BY_USER] = PublicationStates.DELETED_BY_USER;
BlockingPublicationStates[PublicationStates.DELETED_BY_ADMIN] = PublicationStates.DELETED_BY_ADMIN;

var ModeratedPublicationStates = {};
ModeratedPublicationStates[PublicationStates.MODERATED_TEXT_NEVER_AVAILABLE] = PublicationStates.MODERATED_TEXT_NEVER_AVAILABLE;
ModeratedPublicationStates[PublicationStates.MODERATED_TEXT_ON_DEMAND] = PublicationStates.MODERATED_TEXT_ON_DEMAND;

var DeletedPublicationStates = {};
DeletedPublicationStates[PublicationStates.DELETED_BY_USER] = PublicationStates.DELETED_BY_USER;
DeletedPublicationStates[PublicationStates.DELETED_BY_ADMIN] = PublicationStates.DELETED_BY_ADMIN;


/**
 * Message model
 * Frontend model for :py:class:`assembl.models.post.Post`
 * @class app.models.message.MessageModel
 * @extends app.models.base.BaseModel
 */

class MessageModel extends Base.Model.extend({
  /**
   * The url
   * @type {string}
   */
  urlRoot: Ctx.getApiUrl('posts'),

  /**
   * Default values
   * @type {Object}
   */
  defaults: {
    '@view': undefined,
    collapsed: true,
    checked: false,
    read: false,
    parentId: null,
    subject: null,
    like_count: 0,
    liked: false,
    hidden: false,
    body: null,
    idCreator: null,
    avatarUrl: null,
    date: null,
    bodyMimeType: null,
    attachments: undefined,
    publishes_synthesis_id: null,
    metadata_json: null, // this property needs to exist to display the inspiration source of a message (creativity widget)
    publication_state: PublicationStates.PUBLISHED,
    moderator: null,
    moderation_text: null,
    moderated_on: null,
    moderator_comment: null
  }
}) {
  getApiV2Url() {
    return Ctx.getApiV2DiscussionUrl('/posts/'+this.getNumericId());
  }

  parse(rawModel) {
    if(rawModel.attachments !== undefined) {
      rawModel.attachments = new Attachment.Collection(rawModel.attachments,
          {parse: true,
          objectAttachedToModel: this}
          );
    }
    if (rawModel.subject !== undefined) {
      rawModel.subject = new LangString.Model(rawModel.subject, {parse: true});
    }
    if (rawModel.body !== undefined) {
      rawModel.body = new LangString.Model(rawModel.body, {parse: true});
    }
    //console.log("Message Model parse() called, returning:", rawModel);
    return rawModel;
  }

  /**
   * @returns {string} the subject, with any re: stripped
   */
  getSubjectNoRe() {
    var subject = this.get('subject');
    var subjectText = subject ? subject.originalValue() : '';
    if (subjectText) {
      return subjectText.replace(/( *)?(RE) *(:|$) */igm, "");
    }
    else {
      return subjectText;
    }
  }

  /**
   * @returns Array  Json objects representing idea_content_links
   */
  getIdeaContentLinks() {
    var idl = this.get('indirect_idea_content_links');
    if (!idl) {
      return [];
    }

    return idl;
  }

  hasIdeaContentLinks() {
    var idls = this.getIdeaContentLinks();
    return idls.length > 0;
  }

  /**
   * @returns {number} the quantity of all descendants
   */
  getDescendantsCount() {
    var children = this.getChildren();
    var count = children.length;

    _.each(children, function(child) {
      count += child.getDescendantsCount();
    });

    return count;
  }

  visitDepthFirst(visitor, includeHidden) {
    var ancestry = [this.getId()];
    this.collection.visitDepthFirst(visitor, this, ancestry, includeHidden);
  }

  /**
   * Return all direct children
   * @returns {MessageModel[]}
   */
  getChildren() {
    return this.collection.where({ parentId: this.getId() });
  }

  /**
   * Return a promise to the parent message (if any)
   * Else a promise to null
   * @returns {Promise}
   */
  getParentPromise() {
      if (this.get('parentId')) {
        return this.collection.collectionManager.getMessageFullModelPromise(this.get('parentId'));
      }
      else {
        return Promise.resolve(null);
      }
    }

  getAncestorCount() {
      var parents = this.collection.where({ parentId: this.getId() });
      if (parents.length) {
        return parents[0].getAncestorCount() + 1
      }
      else {
        return 0;
      }
    }

  getParent() {
    return this.collection.where({parentId: this.get('parentId')});
  }

  /**
   * Returns a promise to all segments in the annotator format
   * @returns {Object[]}
   */
  getAnnotationsPromise() {
    var that = this;
    return this.getExtractsPromise()
            .then(function(extracts) {
              var ret = [];

              _.each(extracts, function(extract) {
                //Why this next line?  Benoitg-2014-10-03
                extract.attributes.ranges = extract.attributes._ranges;
                ret.push(_.clone(extract.attributes));
              });

              return ret;
            }

        );
  }

  /**
   * Return all segments in the annotator format
   * @returns {Object[]}
   */
  getExtractsPromise() {
    var that = this;
    return this.collection.collectionManager.getAllExtractsCollectionPromise()
            .then(function(allExtractsCollection) {
              return Promise.resolve(allExtractsCollection.where({idPost: that.getId()}))
                    .catch(function(e) {
                      console.error(e.statusText);
                    });
            }

        );
  }

  /** 
   * Return a promise for the post's creator
   */
  getCreatorPromise() {
    var that = this;

    return this.collection.collectionManager.getAllUsersCollectionPromise()
      .then(function(allUsersCollection) {
        return Promise.resolve(allUsersCollection.getById(that.get('idCreator')))
          .catch(function(e) {
            console.error(e.statusText);
          });
      });
  }

  /**
   * Return a promise for the post's moderator
   */
  getModeratorPromise() {
    var that = this;

    return this.collection.collectionManager.getAllUsersCollectionPromise()
      .then(function(allUsersCollection) {
        return Promise.resolve(allUsersCollection.getById(that.get('moderator')))
          .catch(function(e) {
            console.error(e.statusText);
          });
      });
  }

  /**
   * @event
   */
  onAttrChange() {
    this.save(null, {
      success: function(model, resp) {
            },
      error: function(model, resp) {
        console.error('ERROR: onAttrChange', resp);
      }
    });
  }

  /**
   * Set the `read` property
   * @param {boolean} value
   * @param jquery element
   */
  setRead(value, target) {
    if(target) {
      target.removeClass('readUnreadIndicator').addClass('is-loading');
    }

    var user = Ctx.getCurrentUser();
    var that = this;

    if (user.isUnknownUser()) {
      // Unknown User can't mark as read
      return;
    }

    var isRead = this.get('read');
    if (value === isRead) {
      return; // Nothing to do
    }

    this.set('read', value, { silent: true });

    this.url = Ctx.getApiUrl('post_read/') + this.getId();
    this.save({'read': value}, {
      success: function(model, resp) {
        if(target) {
          target.addClass('readUnreadIndicator').removeClass('is-loading');
        }
        that.trigger('change:read', [value]);
        that.trigger('change', that);
        IdeaLoom.socket_vent.request('ideas:update', resp.ideas);
      },
      error: function(model, resp) {}
    });
  }

  validate(attrs, options) {
    /**
     * check typeof variable
     * */
     
  }

  sync(method, model, options) {
    console.log("message::sync() ", method, model, options);
    if ( method == "patch" ){ // for REST calls of type PATCH, we use APIv2 instead of APIv1
      console.log("we are in patch case");
      var options2 = options ? _.clone(options) : {};
      options2.url = this.getApiV2Url();
      return Backbone.sync(method, model, options2);
    }
    return Backbone.sync(method, model, options);
  }

  destroy(options) {
    var errorCollection = options.errorCollection;
    if (errorCollection){
      //These models are never saved to the backend, and should never be deleted either
      errorCollection.destroyAll(options);
    }
    var attachments = this.get('attachments');
    var that = this;
    return Promise.resolve(attachments.destroyAll(options))
      .then(function(){
        return Base.Model.prototype.destroy.call(that, options);
      });
  }

  /*
    Override toJSON of the message model in order to ensure that
    backbone does NOT try to parse the an object that causes
    recursive read, as there is an attachment object which contains
    the message model.
   */
  toJSON(options) {
    var old = Base.Model.prototype.toJSON.call(this, options);
    //Remove the attachments attribute, as there is a circular dependency
    delete old['attachments'];
    return old;
  }
}

/**
 * Messages collection
 * @class app.models.message.MessageCollection
 * @extends app.models.base.BaseCollection
 */

class MessageCollection extends Base.Collection.extend({
  /**
   * The url
   * @type {string}
   */
  url: Ctx.getApiUrl("posts?view=partial_post"),

  /**
   * The model
   * @type {MessageModel}
   */
  model: MessageModel
}) {
  /** Our data is inside the posts array */
  parse(response) {
    if(response.posts !== undefined) {
      //APIV1
      return response.posts;
    }
    else {
      //APIV2 and socket
      return response;
    }
  }

  /** Get the last synthesis
   * @returns Message.Model or null
   */
  getLastSynthesisPost() {
    var lastSynthesisPost = null;
    var synthesisMessages = this.where({'@type': Types.SYNTHESIS_POST});
    if (synthesisMessages.length > 0) {
      _.sortBy(synthesisMessages, function(message) {
        return message.get('date');
      });
      lastSynthesisPost = _.last(synthesisMessages);
    }

    return lastSynthesisPost;
  }

  /**
   * Traversal function.
   * @param visitor visitor function.  If visitor returns true, traversal continues
   * @returns {Object[]}
   */
  visitDepthFirst(visitor, message, ancestry, includeHidden) {
    var that = this;
    if (ancestry === undefined) {
      ancestry = [];
    }

    if (message === undefined) {
      var rootMessages = this.where({ parentId: null });
      var results = _.map(rootMessages, function(rootMessage) {
        return that.visitDepthFirst(visitor, rootMessage, ancestry, includeHidden);
      });
      return visitor.post_visit(undefined, results);
    }
    else if (includeHidden !== true && message.get('hidden')) {
      // TODO: Do we want to recurse on children of hidden parents?
      // It could be useful for moderation.
      return undefined;
    }
    else if (visitor.visit(message, ancestry)) {
      //Copy ancestry
      ancestry = ancestry.slice(0);
      ancestry.push(message.getId());
      var children = _.sortBy(message.getChildren(), function(child) {
        return child.get('date');
      });
      var results = _.map(children, function(child) {
        return that.visitDepthFirst(visitor, child, ancestry, includeHidden);
      });
      return visitor.post_visit(message, results);
    }
    else {
      console.log("Fallback case, returning undefined");
      return undefined;
    }
  }
}

export default {
  Model: MessageModel,
  Collection: MessageCollection,
  PublicationStates: PublicationStates,
  BlockingPublicationStates: BlockingPublicationStates,
  ModeratedPublicationStates: ModeratedPublicationStates,
  DeletedPublicationStates: DeletedPublicationStates
};

