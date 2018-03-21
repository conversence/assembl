/**
 * 
 * @module app.views.basePanel
 */

import LoaderView from './loaderView.js';

import _ from 'underscore';

/**
 * An abstract class every panel should eventually extend
 * @class app.views.basePanel.BasePanel
 */
var BasePanel = LoaderView.extend({
  constructor: function BasePanel() {
    LoaderView.apply(this, arguments);
  },

  template: _.template(""),
  lockable: false,
  minimizeable: true,
  closeable: false,
  DEFAULT_GRID_SIZE: 3, // grid units
  DEFAULT_MIN_SIZE: 200, // pixels
  gridSize: 3,
  minWidth: 200,
  IDEA_PANEL_GRID_SIZE: 3,
  MESSAGE_PANEL_GRID_SIZE: 5,
  NAVIGATION_PANEL_GRID_SIZE: 4,
  CLIPBOARD_GRID_SIZE: 3,
  CONTEXT_PANEL_GRID_SIZE: 8, //MESSAGE_PANEL_GRID_SIZE + IDEA_PANEL_GRID_SIZE
  SYNTHESIS_PANEL_GRID_SIZE: 8,
  minimized_size: 40,

  /** Subclasses need to call this first, with
   * Object.getPrototypeOf(<superclass>).initialize.apply(this, arguments) */
  initialize:  function(options) {
      this._panelWrapper = options.panelWrapper;
      if (!this._panelWrapper) {
        throw new Error("The panelWrapper wasn't passed in the options");
      }
    },

  /**
   * Only to instanciate other objects.  You should NEVER hold a reference to this,
   * you should chain method calls.
   * @returns a panelWrapper object
   */
   
  getPanelWrapper: function() {
      return this._panelWrapper;
    },

  /**
   * Is this panel the primary navigation panel for it's group?
   * @returns true or false
   */
  isPrimaryNavigationPanel: function() {
      var navPanel = this.getContainingGroup().getNavigationPanel();

      //console.log(navPanel, this, navPanel === this);
      return navPanel === this;
    },

  /**
   * Get the current group.  You should NEVER hold a reference to this,
   * you should chain method calls.
   * @returns a groupContent object, or throws an exception.
   */
   
  getContainingGroup: function() {
      if (this._panelWrapper.groupContent) { //Not using instanceof GroupContent here to avoid requirejs circular dependency.
        return this._panelWrapper.groupContent;
      }
      else {
        throw new Error("The panel wasn't initialized properly (most likely initialize wasn't called by the extended class");
      }
    },

  /**
   * Get the groupState for this panel.  You CAN hold a reference to this.
   * @returns a groupContent object, or throws an exception.
   */
  getGroupState: function() {
      var state = this.getContainingGroup().model.get('states');

      //console.log("getGroupState returning", state, this.getContainingGroup().model);
      return this.getContainingGroup().model.get('states').at(0);
    },

  /**
   * Show the panel is currently loading data
   */
  blockPanel: function() {
    this.$el.addClass('is-loading');
  },

  /**
   * Show the has finished loading data
   */
  unblockPanel: function() {
    this.$el.removeClass('is-loading');
  },

});

export default BasePanel;
