/**
 * 
 * @module app.views.message
 */

import Marionette from 'backbone.marionette';

import Ctx from '../common/context.js';
import i18n from '../utils/i18n.js';
import Permissions from '../utils/permissions.js';
import $ from 'jquery';
import LoaderView from './loaderView.js';
import AgentViews from './agent.js';


// TODO: show ideas associated to the deleted message, using IdeaClassificationNameListView (e.g. which idea the message was top posted in, or to the conversation associated to which ideas does it reply to)
/**
 * @class app.views.message.MessageDeletedByUserView
 */
var MessageDeletedByUserView = LoaderView.extend({
  constructor: function MessageDeletedByUserView() {
    LoaderView.apply(this, arguments);
  },
  className: 'message message-deleted',

  template: "#tmpl-messageDeletedByUser",

  ui: {
    avatar: ".js_avatarContainer",
    name: ".js_nameContainer"
  },

  regions: {
    avatar: "@ui.avatar",
    name: "@ui.name"
  },

  subject: "",
  body: i18n.gettext("This message has been deleted by its author."),

  initialize: function(options) {
    var that = this;
    this.setLoading(true);

    if ("subject" in options){
      this.subject = options.subject;
    }

    if ("body" in options){
      this.body = options.body;
    }

    this.messageListView = options.messageListView;
    this.messageFamilyView = options.messageFamilyView;
    this.viewStyle = this.messageListView.getTargetMessageViewStyleFromMessageListConfig(this);


    this.model.getCreatorPromise().then(function(creator){
      if(!that.isDestroyed()) {
        that.creator = creator;
        that.setLoading(false);
        that.render();
      }
    });
  },

  renderAuthor: function() {
    var agentAvatarView = new AgentViews.AgentAvatarView({
      model: this.creator
    });
    this.showChildView('avatar', agentAvatarView);
    var agentNameView = new AgentViews.AgentNameView({
      model: this.creator
    });
    this.showChildView('name', agentNameView);
  },

  guardedRender: function(){
    if(!this.isDestroyed()) {
      this.render();
    }
  },

  onRender: function(){
    this.$el.attr("id", "message-" + this.model.get('@id'));
    
    if (this.isLoading()) {
      return {};
    }

    this.renderAuthor();

    this.$el.addClass(this.model.get('@type'));

    this.$el.removeClass('unread').addClass('read');

    this.$(".message-subject").addClass('hidden');
  },

  loadAnnotations: function(){
    // empty, needed because called by messageList
  },

  serializeData: function() {
    return {
      message: this.model,
      messageListView: this.messageListView,
      viewStyle: this.viewStyle,
      creator: this.creator,
      parentId: this.model.get('parentId'),
      subject: this.subject,
      body: this.body,
      bodyFormatClass: "body_format_text_plain",
      messageBodyId: Ctx.ANNOTATOR_MESSAGE_BODY_ID_PREFIX + this.model.get('@id'),
      isHoisted: false,
      ctx: Ctx,
      i18n: i18n,
      user_can_see_email: Ctx.getCurrentUser().can(Permissions.ADMIN_DISCUSSION),
      user_is_connected: !Ctx.getCurrentUser().isUnknownUser(),
      read: true // we could use this.model.get('read') but read/unread status is not very important for deleted messages and we don't want to emphasize on this message if it's unread
    };
  },
});

export default MessageDeletedByUserView;

