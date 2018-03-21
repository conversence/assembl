/**
 * 
 * @module app.views.synthesisInIdeaList
 */

import $ from 'jquery';
import Ctx from '../common/context.js';
import IdeaLoom from '../app.js';
import PanelSpecTypes from '../utils/panelSpecTypes.js';
import ideaInIdeaList from './ideaInIdeaList.js';

var SynthesisIdeaView = ideaInIdeaList.IdeaView.extend({
  constructor: function SynthesisIdeaView() {
    ideaInIdeaList.IdeaView.apply(this, arguments);
  },

  /**
   * The template
   * @type {template}
   */
  template: Ctx.loadTemplate('synthesisInIdeaList'),

  /**
   * The render
   */
  onRender: function() {
    Ctx.removeCurrentlyDisplayedTooltips(this.$el);

    var data = this.model.toJSON();

    this.$el.addClass('idealist-item');
    if (this.model.get('num_synthesis_posts') == 0) {
      this.$el.addClass('hidden');
    }
    else {
      this.$el.removeClass('hidden');
    }

    this.$el.html(this.template(data));
    Ctx.initTooltips(this.$el);
    return this;
  },

  /**
   * @events
   */
  events: {
    'click .idealist-title': 'onTitleClick'
  },

  /**
   * @event
   */
  onTitleClick: function() {
    $('.idealist-item').removeClass('is-selected');

    var messageListView = this.getContainingGroup().findViewByType(PanelSpecTypes.MESSAGE_LIST);
    messageListView.triggerMethod('messageList:clearAllFilters');
    messageListView.triggerMethod('messageList:addFilterIsSynthesisMessage');

    this._groupContent.setCurrentIdea(null);

    this.$el.addClass('is-selected');
  }
});

export default SynthesisIdeaView;
