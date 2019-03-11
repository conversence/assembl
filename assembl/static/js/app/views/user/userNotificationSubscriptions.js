/**
 * 
 * @module app.views.user.userNotificationSubscriptions
 */

import Marionette from 'backbone.marionette';

import IdeaLoom from '../../app.js';
import $ from 'jquery';
import _ from 'underscore';
import Promise from 'bluebird';
import CollectionManager from '../../common/collectionManager.js';
import Ctx from '../../common/context.js';
import NotificationSubscription from '../../models/notificationSubscription.js';
import RoleModels from '../../models/roles.js';
import i18n from '../../utils/i18n.js';
import Roles from '../../utils/roles.js';
import Accounts from '../../models/accounts.js';
import UserNavigationMenu from './userNavigationMenu.js';
import LoaderView from '../loaderView.js';
import Analytics from '../../internal_modules/analytics/dispatcher.js';

/**
 * User notification
 * */
var Notification = Marionette.View.extend({
  constructor: function Notification() {
    Marionette.View.apply(this, arguments);
  },

  template:'#tmpl-userSubscriptions',
  tagName:'label',
  className:'checkbox dispb',
  initialize: function(options) {
      this.role = options.role;
      this.roles = options.roles;

      this.listenTo(this.roles, 'remove add', function(model) {
        this.role = (_.size(this.roles)) ? model : undefined;
        this.render();
      });

      if (this.model === 'undefined') {
        this.setLoading(true);
      }
    },
  ui: {
      currentSubscribeCheckbox: ".js_userNotification"
    },
  events: {
      'click @ui.currentSubscribeCheckbox': 'userNotification'
    },
  serializeData: function() {
    return {
      subscription: this.model,
      role: this.role,
      i18n: i18n
    }
  },
  userNotification: function(e) {
    var elm = $(e.target);
    var status = elm.is(':checked') ? 'ACTIVE' : 'UNSUBSCRIBED';

    this.model.set("status", status);
    this.model.set("creation_origin", "USER_REQUESTED");
    this.model.save(null, {
      success: function(model, resp) {
            },
      error: function(model, resp) {
        console.error('ERROR: userNotification', resp)
      }
    });
  },
  updateRole: function(role) {
    this.role = role;
    this.render();
  },
});

var Notifications = Marionette.CollectionView.extend({
  constructor: function Notifications() {
    Marionette.CollectionView.apply(this, arguments);
  },

  childView: Notification,
  initialize: function(options) {
    this.collection = options.notificationsUser;
    this.childViewOptions = {
         role: options.role,
         roles: options.roles
       }
  },
  collectionEvents: {
    'reset': 'render'
  },
  updateRole: function(role) {
    this.childViewOptions.role = role;
    this.children.each(function(child) {
      child.updateRole(role);
    });
  },
});

/**
 * Notification template
 * */
var TemplateSubscription = Marionette.View.extend({
  constructor: function TemplateSubscription() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-templateSubscription',
  tagName:'label',
  className:'checkbox dispb',
  initialize: function(options) {
      this.role = options.role;
      this.roles = options.roles;
      this.notificationsUser = options.notificationsUser;
      this.notificationTemplates = options.notificationTemplates;

      this.listenTo(this.roles, 'remove add', function(model) {
        this.role = (_.size(this.roles)) ? model : undefined;
        this.render();
      });

    },
  ui: {
      newSubscribeCheckbox: ".js_userNewNotification"
    },
  events: {
      'click @ui.newSubscribeCheckbox': 'userNewSubscription'
    },
  serializeData: function() {
      return {
        subscription: this.model,
        role: this.role,
        i18n: i18n
      }
    },
  userNewSubscription: function(e) {
    var elm = $(e.target);
    var that = this;
    var status = elm.is(':checked') ? 'ACTIVE' : 'UNSUBSCRIBED';

    // var notificationSubscriptionTemplateModel = this.notificationTemplates.get(elm.attr('id'));
    var notificationSubscriptionTemplateModel = this.notificationTemplates.find(function(notif){
      return notif.id === elm.attr('id');
    });

    var notificationSubscriptionModel = new NotificationSubscription.Model({
      creation_origin: "USER_REQUESTED",
      status: status,
      '@type': notificationSubscriptionTemplateModel.get('@type'),
      discussion: notificationSubscriptionTemplateModel.get('discussion'),
      human_readable_description: notificationSubscriptionTemplateModel.get('human_readable_description')
    });

    this.notificationsUser.add(notificationSubscriptionModel);

    notificationSubscriptionModel.save(null, {
      success: function(model, response, options) {
        that.notificationTemplates.remove(notificationSubscriptionTemplateModel);
      },
      error: function(model, resp) {
        that.notificationsUser.remove(notificationSubscriptionModel);
        console.error('ERROR: userNewSubscription', resp)
      }
    })
  },
  updateRole: function(role) {
    this.role = role;
    this.render();
  },
});

var TemplateSubscriptions = Marionette.CollectionView.extend({
  constructor: function TemplateSubscriptions() {
    Marionette.CollectionView.apply(this, arguments);
  },

  childView: TemplateSubscription,
  initialize: function(options) {
    var addableGlobalSubscriptions = new Backbone.Collection();
    this.notificationTemplates = options.notificationTemplates;

    options.notificationTemplates.each(function(template) {
      var alreadyPresent = options.notificationsUser.find(function(subscription) {
        if (subscription.get('@type') === template.get('@type')) {
          return true;
        }
        else {
          return false
        }
      });
      if (alreadyPresent === undefined) {
        addableGlobalSubscriptions.add(template)
      }
    });

    this.collection = addableGlobalSubscriptions;

    this.childViewOptions = {
      role: options.role,
      roles: options.roles,
      notificationsUser: options.notificationsUser,
      notificationTemplates: addableGlobalSubscriptions
    }

  },
  collectionEvents: {
    'reset': 'render'
  },
  updateRole: function(role) {
    this.childViewOptions.role = role;
    this.children.each(function(child) {
      child.updateRole(role);
    });
  },
});

/**
 *  Choose an email to notify user
 * */
var NotificationByEmail = Marionette.View.extend({
  constructor: function NotificationByEmail() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-notificationByEmail',
  tagName: 'label',
  className: 'radio',
  ui: {
      preferredEmail: '.js_preferred'
    },
  events: {
      'click @ui.preferredEmail': 'preferredEmail'
    },
  serializeData: function() {
    return {
      account: this.model
    }
  },
  preferredEmail: function() {

    var preferred = (this.$('input[name="email_account"]:checked').val()) ? true : false;

    this.model.set({preferred: preferred});

    this.model.save(null, {
      success: function() {
        console.log('success');
      },
      error: function() {
        console.error('error');
      }
    })

  }

});

var NotificationByEmailsList = Marionette.CollectionView.extend({
  constructor: function NotificationByEmailsList() {
    Marionette.CollectionView.apply(this, arguments);
  },

  childView: NotificationByEmail,
});


var NotificationByEmails = Marionette.View.extend({
  constructor: function NotificationByEmails() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-notificationByEmails',
  regions: {
    list: '.controls',
  },
  onRender: function() {
    this.showChildView('list', new NotificationByEmailsList({
      collection: this.collection,
    }));
  },
});

/**
 * Subscripbe / Unsubscribe action
 * */
var Subscriber = Marionette.View.extend({
  constructor: function Subscriber() {
    Marionette.View.apply(this, arguments);
  },

  template:'#tmpl-userSubscriber',
  ui: {
    unSubscription: ".js_unSubscription",
    subscription: ".js_subscription",
    btnSubscription:'.btnSubscription',
    btnUnsubscription:'.btnUnsubscription'
  },
  events: {
    'click @ui.unSubscription': 'unSubscription',
    'click @ui.subscription': 'subscription'
  },
  initialize: function(options) {
    this.roles = options.roles;
    this.role = options.role;
    this.parent = options.parent;

    var analytics = Analytics.getInstance();
    analytics.changeCurrentPage(analytics.pages.NOTIFICATION_SETTINGS);

    this.listenTo(this.roles, 'remove add', function(model) {
      this.role = (_.size(this.roles)) ? model : undefined;
      this.render();
    });
  },
  serializeData: function() {
    return {
      role: this.role
    }
  },

  unSubscription: function() {
    var that = this;

    if (this.role) {
      this.roles.UnsubscribeUserFromDiscussion();
      this.parent.updateRole(null);
    }
  },

  subscription: function() {
    var that = this;
    var analytics = Analytics.getInstance();
    analytics.trackEvent(analytics.events.JOIN_DISCUSSION_CLICK);

    if (Ctx.getDiscussionId() && Ctx.getCurrentUserId()) {

      var LocalRolesUser = new RoleModels.localRoleModel({
        role: Roles.PARTICIPANT,
        discussion: 'local:Discussion/' + Ctx.getDiscussionId(),
        user_id: Ctx.getCurrentUserId()
      });

      LocalRolesUser.save(null, {
                success: function(model, resp) {
                  that.roles.add(model);
                  analytics.trackEvent(analytics.events.JOIN_DISCUSSION);
                  that.parent.updateRole(model);
                },
                error: function(model, resp) {
                  console.error('ERROR: joinDiscussion->subscription', resp);
                }});
    }
  }

});

var userNotificationSubscriptions = Marionette.View.extend({
  constructor: function userNotificationSubscriptions() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-userNotificationSubscriptions',
  className: 'admin-notifications',
  regions: {
    navigationMenuHolder: '.navigation-menu-holder',
    userNotifications:'#userNotifications',
    templateSubscription: '#templateSubscriptions',
    userSubscriber: '#subscriber',
    notifByEmail: '#notifByEmail'
  },
  onRender: function() {
    var menu = new UserNavigationMenu({selectedSection: "notifications"});
    this.showChildView('navigationMenuHolder', menu);

    var that = this;
    var collectionManager = new CollectionManager();

    Promise.join(collectionManager.getNotificationsUserCollectionPromise(),
           collectionManager.getNotificationsDiscussionCollectionPromise(),
           collectionManager.getMyLocalRoleCollectionPromise(),
           collectionManager.getConnectedSocketPromise(),
            function(NotificationsUser, notificationTemplates, allRoles, socket) {

              that.subscriber = new Subscriber({
                parent: that,
                role: allRoles.isUserSubscribedToDiscussion(),
                roles: allRoles,
              });
              that.showChildView('userSubscriber', that.subscriber);

              that.templateSubscriptions = new TemplateSubscriptions({
                notificationTemplates: notificationTemplates,
                notificationsUser: NotificationsUser,
                role: allRoles.isUserSubscribedToDiscussion(),
                roles: allRoles
              });
              that.showChildView('templateSubscription', that.templateSubscriptions);

              that.userNotification = new Notifications({
                notificationsUser: NotificationsUser,
                role: allRoles.isUserSubscribedToDiscussion(),
                roles: allRoles
              });
              that.showChildView('userNotifications', that.userNotification);

            });

    var emailAccount = new Accounts.Collection();
    var notificationByEmails = new NotificationByEmails({
      collection: emailAccount
    });
    emailAccount.fetch();

    this.showChildView('notifByEmail', notificationByEmails);
  },

  updateRole: function(role) {
    var that = this;
    var allRoles = this.userNotification.childViewOptions.roles;
    var notificationTemplates = this.templateSubscriptions.notificationTemplates;
    this.userNotification.updateRole(role);
    this.templateSubscriptions.updateRole(role);
    if (this.role == null && role != null) {
      // rebuild the notification collections
      this.getRegion('userNotifications').reset();
      this.getRegion('templateSubscription').reset();
      var collectionManager = new CollectionManager();
      collectionManager.getNotificationsUserCollectionPromise(true).then(function(NotificationsUser) {
        that.userNotification = new Notifications({
          notificationsUser: NotificationsUser,
          role: role,
          roles: allRoles,
        });
        that.showChildView('userNotifications', that.userNotification);

        that.templateSubscriptions = new TemplateSubscriptions({
          notificationTemplates: notificationTemplates,
          notificationsUser: NotificationsUser,
          role: role,
          roles: allRoles
        });
        that.showChildView('templateSubscription', that.templateSubscriptions);
      });
    }
  },

  serializeData: function() {
    return {
      i18n: i18n
    }
  }

});

export default userNotificationSubscriptions;
