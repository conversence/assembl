/**
 * 
 * @module app.internal_modules.analytics.dispatcher
 */

// UMD style module defintion. Simplified details below. Read comments to understand dependencies
//var moduleName = 'Analytics_Dispatcher';

import _ from 'underscore';
import Wrapper from './abstract';
import Piwik from './piwik';

  var AnalyticsDispatcher = function(...args) {
    if(this.debug) {
      console.log("AnalyticsDispatcher constructor called");
    }
    Wrapper.call(this, args);  
    this._observers = [];

    /**
     * Update this to keep track of what the current virtual page is.
     * Extremely useful for defining pages in modals, and knowing what the next virtual page will
     * be when Modal is closed. 
     */    
    this.currentPage = null;
  };

  AnalyticsDispatcher.prototype = Object.create(Wrapper.prototype);
  AnalyticsDispatcher.prototype.constructor = AnalyticsDispatcher;
  _.extend(AnalyticsDispatcher.prototype, {

    registerObserver: function(observer) {
      this._observers.push(observer);
    },

    removeObserver: function(observer){
      delete this._observers.indexOf(observer); //empty slot
    },

    notify: function(methodName, args, check_cb){
      var that = this;
      var check_cb = check_cb;
      var args = args;

      if(this.debug) {
        console.log("dispatching " + methodName + " on " + this._observers.length + " observer(s) with argument(s):", args);
      }

      _.each(this._observers, function(observer){
        if (check_cb !== undefined) {
          if (!check_cb(observer)) {
            return;
          }
        }
        if(observer.debug) {
          console.log('Invoking method ' + methodName + ' with argument(s)', args, 'on observer', observer);
        }
        if(observer[methodName]===undefined) {
          throw new Error('Method ' + methodName + ' does not exist');
        }
        observer[methodName](...args);
      });
    },

    getObserver: function(index) {
      if (index >= 0 && index > (this._observers.length -1 )) {
        return this._observers[index]
      }
    },

    initialize: function(options){
      this.validateEventsArray();
      if(this.debug  && this._observers.length < 1) {
        console.warn("No observers registered for analytics");
      }
      this.notify('initialize', arguments);
    },

    changeCurrentPage: function(page, options) {
      if (!(page in this.pages)) {
        if (options && _.has(options,'default') && options['default']){
          this.currentPage = null;
          this.notify('changeCurrentPage', [window.location.href, {}]); //go back to root
        }
        else {
          throw new Error("Unknown page definition: " + page);
        }
      }
      else {
        this.currentPage = page;
        this.notify('changeCurrentPage', arguments);
      }
    },

    trackEvent: function(eventDefinition, value, options) {
      if (_.indexOf(_.values(this.events), eventDefinition) === -1) {
        throw new Error("Unknown event type");
      }
      this.notify('trackEvent', arguments);
    },

    setCustomVariable: function(variableDefinition, value) {
      if (_.indexOf(_.values(this.customVariables), variableDefinition) === -1) {
        throw new Error("Unknown custom variable");
      }
      this.notify('setCustomVariable', arguments);
    },
   
    deleteCustomVariable: function(options){
      this.notify('deleteCustomVariable', arguments);
    },

    trackLink: function(urlPath, options){
      this.notify('trackEvent', arguments);
    },

    trackDomElement: function(element) {
      this.notify('trackDomElement', arguments);
    },

    trackGoal: function(goalId, options){
      this.notify('trackGoal', arguments, function(observer){
        // To add more checks for other Observer types, must update this check_cb
        if (observer.constructor.name === 'Piwik') {
          if (globalAnalytics && globalAnalytics.piwik
            && globalAnalytics.piwik.goals
            && globalAnalytics.piwik.goals.goalId) {
            return true;
          }
          else { return false; }
        }
      });
    },

    createNewVisit: function(){
      this.notify('createNewVisit', []);
    },

    setUserId: function(id) {
      this.notify('setUserId', [id]);
    },

    //For debug use ONLY
    commit: function(options){
      if (options.piwik){
        this._observers[0].commit();
      }
    },

    //Only Piwik has implemented these functions. Very thin wrapper.  
    trackImpression: function(contentName, contentPiece, contentTarget) {
      this.notify('trackImpression', arguments);
    },

    trackVisibleImpression: function(checkOnScroll, timeInterval){
      this.notify('trackVisibleImpression', arguments);
    },

    trackDomNodeImpression: function(domNode){
      this.notify('trackDomNodeImpression', arguments);
    },

    trackContentInteraction: function(interaction, contentName, contentPiece, contentTarget){
      this.notify('trackContentInteraction', arguments);
    },

    trackDomNodeInteraction: function(domNode, contentInteraction){
      this.notify('trackDomNodeInteraction', arguments);
    },

    getCurrentPage: function(){
      return this.currentPage;
    }
  });

  var _analytics;

    /** A factory returning a completely setup singleton of a concrete analytics 
     * object.
     */
  var Analytics = {
    getInstance: function () {
      if (!_analytics){
        _analytics = new AnalyticsDispatcher();
        globalAnalytics = globalAnalytics || {};
        if (globalAnalytics.piwik && globalAnalytics.piwik.isActive) {
          if(_analytics.debug) {
            console.log("Registering piwik");
          }
          var p = new Piwik();
          _analytics.registerObserver(p);
        }
        else if (globalAnalytics.google && globalAnalytics.google.isActive) {
          if(_analytics.debug) {
            console.log("Registering Google Analytics");
          }
          var g = null; //Where Google Analytics would go
          _analytics.registerObserver(g);
        }
        _analytics.initialize({});
      }
      return _analytics;
    }
  };

export default Analytics;
