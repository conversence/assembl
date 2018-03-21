/**
 * 
 * @module app.views.reusableDataFields.trueFalseField
 */

import Marionette from 'backbone.marionette';

import _ from 'underscore';
import IdeaLoom from '../../app.js';
import Ctx from '../../common/context.js';

var TrueFalseField = Marionette.View.extend({
  constructor: function TrueFalseField() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-trueFalseField',
  attributes: {
    "class": "TrueFalseField"
  },
  initialize: function(options) {
    this.view = this;

    this.canEdit = (_.has(options, 'canEdit')) ? options.canEdit : true;
    this.modelProp = (_.has(options, 'modelProp')) ? options.modelProp : null;

    if (this.model === null) {
      throw new Error('TrueFalseField needs a model');
    }
    if (this.modelProp === null) {
      throw new Error('TrueFalseField needs a modelProp');
    }
    if (this.model.get(this.modelProp) === undefined) {
      throw new Error(this.modelProp + ' must be initialised to true or false');
    }
  },

  events: {
    'change': 'onChange'
  },

  onRender: function() {
    this.$( "input:checkbox").prop( "checked", this.model.get(this.modelProp) );
    this.$( "input:checkbox").prop( "disabled", !this.canEdit);
  },

  onChange: function(ev) {
    if (this.canEdit) {
      var data = this.$( "input:checkbox").prop("checked");
      if (this.model.get(this.modelProp) != data) {
        /* Nor save to the database and fire change events
         * if the value didn't change from the model
         */
        this.model.save(this.modelProp, data, {
          success: function(model, resp) {
          },
          error: function(model, resp) {
            console.error('ERROR: onChange', resp);
          }
        });
      }
    }
  }

});

export default TrueFalseField;
