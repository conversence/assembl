/**
 * 
 * @module app.views.admin.adminPartners
 */

import Marionette from 'backbone.marionette';

import Backbone from 'backbone';
import BackboneModal from 'backbone.modal';
import IdeaLoom from '../../app.js';
import $ from 'jquery';
import CollectionManager from '../../common/collectionManager.js';
import Ctx from '../../common/context.js';
import i18n from '../../utils/i18n.js';
import partnerModel from '../../models/partners.js';
import AdminNavigationMenu from './adminNavigationMenu.js';

var Partners = Marionette.View.extend({
  constructor: function Partners() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-partnersInAdmin',
  className: 'gr',
  ui: {
      'partnerItem':'.js_deletePartner',
      'partnerItemEdit': '.js_editPartner'
    },
  events: {
    'click @ui.partnerItem':'deletePartner',
    'click @ui.partnerItemEdit': 'editPartner'
  },

  modelEvents: {
    'change':'render'
  },

  deletePartner: function() {
    var that = this;
    this.model.destroy({
      success: function() {
        that.$el.fadeOut();
      },
      error: function() {

      }
    });
  },

  editPartner: function() {
    var self = this;

    var Modal = Backbone.Modal.extend({
  constructor: function Modal() {
    Backbone.Modal.apply(this, arguments);
  },

      template: _.template($('#tmpl-adminPartnerEditForm').html()),
      className: 'partner-modal popin-wrapper',
      cancelEl: '.close, .js_close',
      keyControl: false,
      model: self.model,
      initialize: function() {
        this.$('.bbm-modal').addClass('popin');
      },
      events: {
        'submit #partner-form-edit':'validatePartner'
      },
      validatePartner: function(e) {

        if (e.target.checkValidity()) {

          var that = this;

          self.model.set({
            description: this.$('.partner-description').val(),
            homepage: this.$('.partner-homepage').val(),
            logo: this.$('.partner-logo').val(),
            name: this.$('.partner-name').val(),
            is_initiator: (this.$('.partner-initiator:checked').val()) ? true : false
          });

          self.model.save(null, {
            success: function(model, resp) {
              that.triggerSubmit(e);
            },
            error: function(model, resp) {
              console.log(resp)
            }
          });

        }

        return false;
      }
    });

    var modal = new Modal();

    IdeaLoom.rootView.showChildView('slider', modal);

  }
});

var PartnerList = Marionette.CollectionView.extend({
  constructor: function PartnerList() {
    Marionette.CollectionView.apply(this, arguments);
  },

  childView: Partners,
  collectionEvents: {
    'add sync':'render'
  }
});

var adminPartners = Marionette.View.extend({
  constructor: function adminPartners() {
    Marionette.View.apply(this, arguments);
  },

  template: '#tmpl-adminPartners',
  className: 'admin-notifications',
  ui: {
      partners: '.js_addPartner',
      close: '.bx-alert-success .bx-close'
    },

  regions: {
    partner: '#partner-content',
    navigationMenuHolder: '.navigation-menu-holder'
  },

  events: {
      'click @ui.partners': 'addNewPartner',
      'click @ui.close': 'close'
    },

  serializeData: function() {
    return {
      Ctx: Ctx
    }
  },

  onRender: function() {
    var that = this;
    var collectionManager = new CollectionManager();

    Ctx.initTooltips(this.$el);

    collectionManager.getAllPartnerOrganizationCollectionPromise()
            .then(function(allPartnerOrganization) {

              var partnerList = new PartnerList({
                collection: allPartnerOrganization
              });

              that.partners = allPartnerOrganization;

              that.showChildView('partner', partnerList);
            });

    var menu = new AdminNavigationMenu.discussionAdminNavigationMenu(
      {selectedSection: "partners"});
    this.showChildView('navigationMenuHolder', menu);
  },

  close: function() {
    this.$('.bx-alert-success').addClass('hidden');
  },

  addNewPartner: function() {
    var self = this;

    var Modal = Backbone.Modal.extend({
  constructor: function Modal() {
    Backbone.Modal.apply(this, arguments);
  },

      template: _.template($('#tmpl-adminPartnerForm').html()),
      className: 'partner-modal popin-wrapper',
      cancelEl: '.close, .js_close',
      keyControl: false,
      initialize: function() {
        this.$('.bbm-modal').addClass('popin');
      },
      events: {
        'submit #partner-form':'validatePartner'
      },
      validatePartner: function(e) {

        if (e.target.checkValidity()) {
          var inputs = document.querySelectorAll('#partner-form *[required]');
          var that = this;

          var partner = new partnerModel.Model({
            description: this.$('.partner-description').val(),
            homepage: this.$('.partner-homepage').val(),
            logo: this.$('.partner-logo').val(),
            name: this.$('.partner-name').val(),
            is_initiator: (this.$('.partner-initiator:checked').val()) ? true : false
          });

          partner.save(null, {
            success: function(model, resp) {
              that.destroy();
              $(inputs).val('');
              self.partners.fetch();
            },
            error: function(model, resp) {
              console.log(resp)
            }
          })
        }

        return false;
      }
    });

    var modal = new Modal();

    IdeaLoom.rootView.showChildView('slider', modal);

  }

});

export default adminPartners;
