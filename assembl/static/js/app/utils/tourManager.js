/**
 * 
 * @module app.utils.tourManager
 */

import Marionette from 'backbone.marionette';

import i18n from './i18n.js';
import TourModel from '../models/tour.js';
import Ctx from '../common/context.js';
import _ from 'underscore';
import $ from 'jquery';
import AppTours from './tours/appTours.js';
import hopscotch from 'hopscotch';
import Raven from 'raven-js';


var TourManager = Marionette.Object.extend({
  channelName: 'tour',
  nextTours: [],
  tourModel: undefined,
  currentTour: undefined,
  firstTourStarted: false,
  hopscotch_i18n: {
          nextBtn: i18n.gettext('Next'),
          prevBtn: i18n.gettext('Back'),
          doneBtn: i18n.gettext('Done'),
          skipBtn: i18n.gettext('Skip'),
          closeTooltip: i18n.gettext('Close')
      },

  radioEvents: {
    'requestTour': 'requestTour',
  },

  initialize: function() {
    if (Ctx.isAdminApp()) {
      return;
    }
    var that = this;
    var currentUser = Ctx.getCurrentUser();
    this.user = currentUser;
    hopscotch.configure({
      onShow: function() {
        that.onShow();
      },
      onNext: function() {
          // need to scroll messageListPanel there.
      },
      onClose: function() {
        that.stopTours();
      },
      i18n: this.hopscotch_i18n
    });
    hopscotch.listen('end', function() {
      that.afterLastStep();
    });
    if (!currentUser.isUnknownUser()) {
      this.tourModel = new TourModel.Model();
      this.tourModel.fetch({
        success: function() {
          that.initialize2();
        }});
    } else {
      this.initialize2();
    }
  },
  initialize2: function() {
    var that = this;
    var toursById = {};
    for (var i in AppTours) {
        var tour = AppTours[i];
        tour.position = i;
        tour.tour.id = tour.name;
        toursById[tour.name] = tour;
        if (tour.autostart && !this.isTourSeen(tour.name)) {
            this.nextTours.push(tour);
        }
    }
    this.toursById = toursById;
    if(Ctx.isSmallScreen()){
      this.stopTours();
    }else{
      setTimeout(function() {
        that.firstTourStarted = true;
        if (that.nextTours.length > 0) {
          that.currentTour = that.getNextTour(true);
          if (that.currentTour !== undefined) {
            that.startCurrentTour();
          }
        }
      }, 4000);
    }
  },

  isTourSeen: function(tourName) {
      if (this.tourModel === undefined) {
        var seen = JSON.parse(window.localStorage.getItem('toursSeen') || "{}");
        return seen[tourName];
      } else {
          return this.tourModel.get(tourName);
      }
  },

  tourIsSeen: function(tourName) {
      if (this.tourModel === undefined) {
        var seen = {};
        try {
          seen = JSON.parse(window.localStorage.getItem('toursSeen') || "{}");
        } catch (err) {
          Raven.captureMessage("wrong toursSeen in localStorage", {extra: {"error": err}});
        }
        seen[tourName] = true;
        window.localStorage.setItem('toursSeen', JSON.stringify(seen));
      } else {
          this.tourModel.isSeen(tourName);
      }
  },

  getNextTour: function(remove) {
    while (this.nextTours.length > 0) {
      var tour = this.nextTours[0];
      if (tour.condition !== undefined) {
        if (!tour.condition()) {
            this.nextTours.shift();
            continue;
        }
      }
      if (remove) {
          return this.nextTours.shift();
      } else {
          return tour;
      }
    }
    return undefined;
  },

  requestTour: function(tourName) {
    if (tourName === undefined) {
      console.error("undefined tour name");
      return;
    }
    var tour = this.toursById[tourName];
    if (tour === undefined) {
      Raven.captureMessage("Unknown tour", {extra: {"tour_name": tourName}});
      return;
    }
    if (this.isTourSeen(tourName)) {
      return;
    }
    if (tour == this.currentTour) {
      return;
    }
    if (this.currentTour !== undefined || !this.firstTourStarted) {
      if (this.nextTours.length === 0) {
        this.nextTours.push(tour);
        if (this.currentTour !== undefined) {
          // change the "Done" to "Next" live.
          this.checkForLastStep();
        }
      } else {
        // insert in-order, unless it's already there.
        var pos = _.sortedIndex(this.nextTours, tour, "position");
        if (!((pos < this.nextTours.length && this.nextTours[pos] === tour)
          || (pos > 0 && this.nextTours[pos - 1] === tour))) {
          this.nextTours.splice(pos, 0, tour);
        }
      }
      return;
    }
    if (tour.condition !== undefined && !tour.condition()) {
      return;
    }
    if (tour.beforeStart !== undefined) {
      tour.beforeStart();
    }
    // TODO: Scroll to show ID?
    this.currentTour = tour;
    this.startCurrentTour();
  },

  onShow: function() {
    if (this.currentTour === undefined) {
      Raven.captureMessage("onShow came after tour was cleared");
      this.currentTour = this.toursById[hopscotch.getCurrTour().name];
    }
    this.checkForLastStep();
    var stepNum = hopscotch.getCurrStepNum();
    var step = this.currentTour.tour.steps[stepNum];
    //console.log("onShow", this.currentTour.name, stepNum);
    this.currentTour.wasSeen = true;
    if (step.stepOnShow !== undefined) {
      step.stepOnShow();
    }
    //that.$(".panel-body").scroll(that, that.scrollLogger);
  },

  checkForLastStep: function() {
    var stepNum = hopscotch.getCurrStepNum();
    var step = this.currentTour.tour.steps[stepNum];
    if (stepNum + 1 == this.currentTour.tour.steps.length) {
      var nextTour = this.getNextTour(false);
      var nextButton = $(".hopscotch-next");
      if (nextTour !== undefined) {
        nextButton.text(i18n.gettext("Next"));
      }
    }
  },

  afterLastStep: function() {
    if (this.currentTour === undefined) {
      Raven.captureMessage("afterLastStep came after tour was cleared");
      this.currentTour = this.toursById[hopscotch.getCurrTour().name];
    }
    if (this.currentTour.cleanup !== undefined) {
      this.currentTour.cleanup();
    }
    this.tourIsSeen(this.currentTour.name);
    this.currentTour = this.getNextTour(true);
    if (this.currentTour !== undefined) {
      this.startCurrentTour();
    }
  },

  stopTours: function() {
    this.nextTours = [];
  },

  startCurrentTour: function() {
    var that = this;
    var tour = this.currentTour;
    // We may be within the end signal, so make it asynchronous.
    setTimeout(function() {
      hopscotch.startTour(tour.tour);
      // Some tour steps fail
      setTimeout(function() {
        if (!tour.wasSeen) {
          if (tour.numErrors === undefined) {
            tour.numErrors = 1;
          } else {
            tour.numErrors += 1;
          }
          if (tour.numErrors > 1) {
            Raven.captureMessage("Tour was not seen", {extra: {"tour_name": tour.name}});
            that.currentTour = that.getNextTour(true);
          }
          if (that.currentTour !== undefined) {
            that.startCurrentTour();
          }
        }
      }, 1000);
    }, 0);
  }
});

export default TourManager;
