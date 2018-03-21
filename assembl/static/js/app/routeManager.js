/**
 * Manage views instanciation.
 * @module app.routeManager
 */

import Marionette from 'backbone.marionette';

import IdeaLoom from './app.js';
import Promise from 'bluebird';
import Ctx from './common/context.js';
import Agents from './models/agents.js';
import Storage from './objects/storage.js';
import Loader from './views/loader.js';
import NavBar from './views/navBar.js';
import InfobarsViews from './views/infobar.js';
import InfobarsModels from './models/infobar.js';
import UrlParser from './url/url.pegjs';
import GroupContainer from './views/groups/groupContainer.js';
import PanelSpecTypes from './utils/panelSpecTypes.js';
import CookiesManager from './utils/cookiesManager.js';
import CollectionManager from './common/collectionManager.js';
import ViewsFactory from './objects/viewsFactory.js';
import AdminDiscussion from './views/admin/adminDiscussion.js';
import AdminNotificationSubscriptions from './views/admin/adminNotificationSubscriptions.js';
import AdminPartners from './views/admin/adminPartners.js';
import UserNotificationSubscriptions from './views/user/userNotificationSubscriptions.js';
import Profile from './views/user/profile.js';
import AgentViews from './views/agent.js';
import Authorization from './views/authorization.js';
import Permissions from './utils/permissions.js';
import Account from './views/user/account.js';
import Widget from './models/widget.js';
import AdminDiscussionSettings from './views/admin/adminDiscussionSettings.js';
import AdminTimeline from './views/admin/adminTimelineEvents.js';
import PreferencesView from './views/preferencesView.js';
import FirstIdeaToShowVisitor from './views/visitors/firstIdeaToShowVisitor.js';
import i18n from './utils/i18n.js';
import Analytics from './internal_modules/analytics/dispatcher.js';
import $ from 'jquery';
var QUERY_STRINGS = {
  'source': ['notification', 'share']
};

/**
 * 
 * @class app.routeManager.TrackAnalyticsWithQueryString
 */

var trackAnalyticsWithQueryString = function(qs, context){
  
  //console.log('tracking with query string ' + qs + ' using context ' + context);

  function arrayHas(array, id){
    var result = false;
    _.each(array, function(a){
      if (a === id){
        result = true;
      }
    });
    return result;
  };

  function doCheck(param, success){
    var tmp = param.split('=');
    var k = tmp[0];
    var v = tmp[1];

    if ( _.has(QUERY_STRINGS, k) ){
      if ( arrayHas(QUERY_STRINGS[k], v) ){
        success(k,v);
      }
      else {
        console.warn('[Analytics] Query string ' + k + '=' + v + ' ; ' + k + ' is valid, but ' + v + ' does nothing.');
      }
    }
    else {
      console.warn('[Analytics] Query string ' + k + '=' + v + ' does nothing');
    }
  };

  var analytics = Analytics.getInstance();

  var cb = function(key, value){
    //Define what type of event is fired here
    switch(value){
      case 'notification':
        if (context === 'post'){
          //console.log('trackEvent enter post via notification');
          analytics.trackEvent(analytics.events.ENTER_POST_VIA_NOTIFICATION);
        }
        else {
          console.warn("Unknown context "+context);
        }
        
        break;
      case 'share':
        if (context === 'post'){
          //console.log('trackEvent enter post via share');
          analytics.trackEvent(analytics.events.ENTER_POST_VIA_SHARE);
        }
        else if (context === 'idea') {
          //console.log('trackEvent enter idea via share');
          analytics.trackEvent(analytics.events.ENTER_IDEA_VIA_SHARE);
        }
        else {
          console.warn("Unknown context "+context);
        }
        break;
      default:
        //Question, should there be an "UNKNOWN" case for ideas and messages here
        //so we find new cases we forgot.  For example we'll soon add the synthesis
        //to notifications, which will point to ideas.  It wouldn't be logged at 
        //all as it is, even IF is add the 'idea' context to the share url.
        console.warn("Unknown value "+value);
        break;
    }

  };
  if (qs) {
    if ( qs.indexOf('&') > -1 ){
      _.each( qs.split('&'), function(param){
        doCheck(param, cb);
      });
    }
    else {
      doCheck(qs, cb);
    }
  }
  else {
    console.warn("Ùnable to track event, there are no event tracking query parameters present.")
  }

};

/**
 * 
 * @class app.routeManager.RouteManager
 */

var routeManager = Marionette.Object.extend({

  initialize: function() {
    window.assembl = {};

    this.collectionManager = new CollectionManager();

    /**
     * fulfill app.currentUser
     */
    this.loadCurrentUser();
  },

  defaults: function() {
    Backbone.history.navigate('', true);
  },

  home: function() {
    this.restoreViews(true);
  },

  edition: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var edition = new AdminDiscussion();
      IdeaLoom.rootView.showChildView('groupContainer', edition);
    }
  },

  partners: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var partners = new AdminPartners();
      IdeaLoom.rootView.showChildView('groupContainer', partners);
    }
  },

  notifications: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var notifications = new AdminNotificationSubscriptions();
      IdeaLoom.rootView.showChildView('groupContainer', notifications);
    }
  },

  settings: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var adminSetting = new AdminDiscussionSettings();
      IdeaLoom.rootView.showChildView('groupContainer', adminSetting);
    }
  },

  timeline: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var adminSetting = new AdminTimeline();
      IdeaLoom.rootView.showChildView('groupContainer', adminSetting);
    }
  },

  adminDiscussionPreferences: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var page = new PreferencesView.DiscussionPreferencesView();
      IdeaLoom.rootView.showChildView('groupContainer', page);
    }
  },

  adminGlobalPreferences: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var page = new PreferencesView.GlobalPreferencesView();
      IdeaLoom.rootView.showChildView('groupContainer', page);
    }
  },

  userNotifications: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var user = new UserNotificationSubscriptions();
      IdeaLoom.rootView.showChildView('groupContainer', user);
    }
  },

  profile: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var profile = new Profile();
      IdeaLoom.rootView.showChildView('groupContainer', profile);
    }
  },

  userDiscussionPreferences: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var page = new PreferencesView.UserPreferencesView();
      IdeaLoom.rootView.showChildView('groupContainer', page);
    }
  },

  account: function() {
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    if (this.userHaveAccess()) {
      var account = new Account();
      IdeaLoom.rootView.showChildView('groupContainer', account);
    }
  },

  post: function(id, qs) {
      //TODO: add new behavior to show messageList Panel
      // We are skiping restoring the group state

      trackAnalyticsWithQueryString(qs, 'post');

      this.restoreViews(undefined, undefined, true).then(function(groups) {
        var firstGroup = groups.children.first();
        var messageList = firstGroup.findViewByType(PanelSpecTypes.MESSAGE_LIST);
        if (!messageList) {
          if (firstGroup.isSimpleInterface()) {
            IdeaLoom.other_vent.trigger("DEPRECATEDnavigation:selected", 'debate', null);
          }
          else {
            throw new Error("WRITEME:  There was no group with a messagelist available");
          }
        }
        if(!messageList.isViewStyleThreadedType(messageList.currentViewStyle)) {
          //We need context for the message
          //Set the view style to default (supposed to be a threaded type)
          //but do not store it
          messageList.setViewStyle(null, true);
        }
        if (id.substr(0, 14) === "local:Content/") {
          // legacy URI
          id = "local:SPost/" + id.substr(14);
        }

        IdeaLoom.message_vent.trigger('messageList:showMessageById', id);

        Backbone.history.navigate('/', {replace: true});
      });
    },

  idea: function(id, qs) {
    //TODO: add new behavior to show messageList Panel

    trackAnalyticsWithQueryString(qs, 'idea');
    this.restoreViews().then(function() {
      //We really need to address panels explicitely
      IdeaLoom.other_vent.trigger("DEPRECATEDnavigation:selected", 'debate', null);
      if (id.substr(0, 11) === "local:Idea/") {
        // legacy URI
        id = "local:GenericIdeaNode/" + id.substr(11);
      }
      IdeaLoom.idea_vent.trigger('DEPRECATEDideaList:selectIdea', id, "from_url", true);
    });

    //TODO: fix this horrible hack that prevents calling
    //showMessageById over and over.
    //window.history.pushState('object or string', 'Title', '../');
    Backbone.history.navigate('/', {replace: true});
  },

  user: function(id, qs) {
    this.restoreViews().then(function() {
      var collectionManager = CollectionManager();
      collectionManager.getAllUsersCollectionPromise().then(
          function(agentsCollection) {
            if (id.substr(0, 19) === "local:AgentProfile/") {
              // legacy URI
              id = "local:Agent/" + id.substr(19);
            }
            var agent = agentsCollection.get(id);
            if(!agent) {
              console.log(agentsCollection, id)
              throw new error("User not found");
            }
            AgentViews.showUserMessages(agent);
          });
    });
    Backbone.history.navigate('/', {replace: true});
  },

  /*
    Utilized for Angular based widgets loaded into IdeaLoom
    in an iframe wrapped in a Backbone.Modal.
   */
  openExternalWidget: function(widget){
    var options = {
      "target_url": widget.getUrlForUser(),
      "modal_title": widget.getLinkText(Widget.Model.prototype.INFO_BAR)
    };
    Ctx.openTargetInModal(null, null, options);
  },

  /*
    Utilized for Marionette based widgets loaded into
    IdeaLoom by instantiating the view onto the IdeaLoom
    modal region
   */
  openLocalWidget: function(widget, arg){
    var View;
    //Add more conditions to the switch statement
    //in order to cover different conditions
    switch (widget.get('@type')){
      default:
        console.log("the widget model", widget);
        console.log('the arg', arg);
        var Views = require('./views/tokenVoteSession.js').default;
        if ((arg) && (arg === 'result')){
          View = Views.TokenVoteSessionResultModal
        }
        else {
          View = Views.TokenVoteSessionModal
        }
        break;
    };
    Ctx.setCurrentModalView(View);
    IdeaLoom.rootView.showChildView('slider', new View({model: widget}));
  },

  // example: http://localhost:6543/jacklayton/widget/local%3AWidget%2F64/result
  widgetInModal: function(id, arg) {
    var that = this;
    this.restoreViews().then(function(groups) {
      var collectionManager = CollectionManager();
      var widgetPromise = collectionManager.getAllWidgetsPromise()
        .then(function(allWidgetsCollection) {
          return Promise.resolve(allWidgetsCollection.get(id))
            .catch(function(e) {
              console.error(e.statusText);
            });
        });
      widgetPromise.then(function(widget){
        /*
          Check which type of widget it is. If it is an Angular-based widget,
          open it in target modal.

          If Marionette-based widget, open modal accordingly, and if extra
          args are passed, pass the parameter accordingly. 
         */
        if (widget.isIndependentModalType()){
          that.openExternalWidget(widget);
        } else{
          that.openLocalWidget(widget, arg);
        }
      });
      Backbone.history.navigate('/', {replace: true});
    });
  },

  about: function() {
      this.restoreViews(undefined, undefined, true).then(function(groups) {
        var firstGroup = groups.children.first();
        if (firstGroup.isSimpleInterface()) {
          IdeaLoom.other_vent.trigger("DEPRECATEDnavigation:selected", 'about');
        } else {
            // should we then switch to simple interface?
        }
        Backbone.history.navigate('/', {replace: true});
      });
    },

  sentryTest: function() {
    var Raven = require('raven-js').default;
    Raven.captureMessage("This is a test, an uncaught non existent function call will follow.");
    //This crashes on purpose
    crashme();
  },

  loadCurrentUser: function() {
    var user = null;
    if (Ctx.getCurrentUserId()) {
      user = new Agents.Model();
      user.fetchFromScriptTag('current-user-json');
    }
    else {
      user = new Agents.Collection().getUnknownUser();
    }

    user.fetchPermissionsFromScriptTag();
    Ctx.setCurrentUser(user);
    Ctx.loadCsrfToken(true);
  },

  groupSpec: function(path) {
    console.log(path);
    try {
      var structure = UrlParser.parse("/" + path);
      console.log(structure);
      this.restoreViews(false, structure);
    } catch (e) {
      Raven.captureException(e);
      this.restoreViews(true);
    }
  },

  /**
   * @param from_home -  If true, the function was called from the home view
   * @returns promise to a GroupContainer
   */
  restoreViews: function(from_home, url_structure, skip_group_state) {
    var collectionManager = CollectionManager();
    IdeaLoom.rootView.showChildView('headerRegions', new NavBar());
    //On small screen (mobile) don't instantiate the infobar
    if(!Ctx.isSmallScreen()){
      collectionManager.getWidgetsForContextPromise(
        Widget.Model.prototype.INFO_BAR, null, ["closeInfobar"]).then(
        function(widgetCollection) {
          var discussionSettings = Ctx.getPreferences();
          var infobarsCollection = new InfobarsModels.InfobarsCollection();
          var isCookieUserChoice = CookiesManager.getUserCookiesAuthorization();
          if(!isCookieUserChoice && discussionSettings.cookies_banner){
            infobarsCollection.add(new InfobarsModels.CookieInfobarModel());
          }
          widgetCollection.each(function(widgetModel){
            var model = new InfobarsModels.WidgetInfobarModel({widget: widgetModel});
            infobarsCollection.add(model);
          });
          IdeaLoom.rootView.showChildView('infobarRegion', new InfobarsViews.InfobarsView({collection: infobarsCollection}));
        });
    }
    IdeaLoom.rootView.showChildView('groupContainer', new Loader());
    /**
     * Render the current group of views
     * */
    var groupSpecsP = this.collectionManager.getGroupSpecsCollectionPromise(ViewsFactory, url_structure, skip_group_state);

    return groupSpecsP.then(function(groupSpecs) {
      var groupsView = new GroupContainer({
        collection: groupSpecs
      });

      var lastSave = Storage.getDateOfLastViewSave();
      var currentUser = Ctx.getCurrentUser();
      if (lastSave && !lastSave.getDate()) {
        // case of Invalid Date
        lastSave = null;
      }

      groupsView.render(); //So children can be used

      if (from_home && !lastSave && (
              currentUser.isUnknownUser() || currentUser.get('is_first_visit'))) {
        Promise.join(collectionManager.getAllIdeasCollectionPromise(),
                     collectionManager.getAllExtractsCollectionPromise(),
                     collectionManager.getAllIdeaLinksCollectionPromise(),
                             function(ideas, extracts, links) {
                               var visitor = new FirstIdeaToShowVisitor(extracts);
                               ideas.visitBreadthFirst(links, visitor);
                               var idea = visitor.ideaWithExtract || visitor.firstIdea;
                               if (idea !== undefined) {
                                 // the table of ideas view did not start listening yet.
                                 // TODO: Break magic timeout.
                                 setTimeout(function() {
                                   IdeaLoom.idea_vent.trigger('DEPRECATEDideaList:selectIdea', idea.id);
                                 }, 250);
                               }
                             });
      } else {
        //activate_tour = false;
        if (!lastSave
            || (Date.now() - lastSave.getTime() > (7 * 24 * 60 * 60 * 1000))
            ) {
          /* Reset the context of the user view, if it's too old to be
           usable, or if it wasn't initialized before */

          // Find if a group exists that has a navigation panel
          var navigableGroupSpec = groupSpecs.find(function(aGroupSpec) {
            return aGroupSpec.findNavigationSidebarPanelSpec();
          });
          if (navigableGroupSpec) {
            setTimeout(function() {
              var groupContent = groupsView.children.findByModel(navigableGroupSpec);
              groupContent.NavigationResetDefaultState();
            }, 0);
          }
        }
      }

      IdeaLoom.rootView.showChildView('groupContainer', groupsView);

      return Promise.resolve(groupsView);
    });
  },

  userHaveAccess: function() {
    /**
     * TODO: backend api know private discussion and can redirect to login
     * add this method to home page route
     * */
    var route = Backbone.history.fragment;

    var access = false;

    if (!Ctx.getCurrentUserId()) {
      var authorization = new Authorization({
        error: 401,
        message: i18n.gettext('You must be logged in to access this page.')
      });
      IdeaLoom.rootView.showChildView('groupContainer', authorization);
      return;
    }

    switch (route){
      case 'edition':
      case 'settings':
      case 'timeline':
      case 'notifications':
      case 'partners':
        access = (!Ctx.getCurrentUser().can(Permissions.ADMIN_DISCUSSION)) ? false : true;
        break;

      default:
        access = (!Ctx.getCurrentUser().can(Permissions.READ)) ? false : true;
        break;
    }

    if (!access) {
      var authorization = new Authorization({
        error: 401,
        message: i18n.gettext('Your level of permissions do not allow you to see the rest of this content')
      });
      IdeaLoom.rootView.showChildView('groupContainer', authorization);
    }

    return access;
  }

});

export default new routeManager();
