/**
 * A user's preference language
 * @module app.models.languagePreference
 */
import _ from 'underscore';

import Base from './base.js';
import Ctx from '../common/context.js';
import i18n from '../utils/i18n.js';
import LangString from './langstring.js';
import Types from '../utils/types.js';

var clean = function(input){
    if (!input){
        return input;
    }
    var tmp;
    if (input.indexOf("_") > -1 ){
        tmp = input.split("_")[0];
    } else {
        tmp = input;
    }
    return tmp;
};

/**
 * A user's preference on how to handle a language: should it be translated, and to what?
 * Frontend model for :py:class:`assembl.models.auth.UserLanguagePreference`
 * @class app.models.languagePreference.LanguagePreferenceModel
 * @extends app.models.base.BaseModel
 */
class LanguagePreferenceModel extends Base.Model.extend({
  /**
   * Defaults
   * @type {Object}
   */
  defaults: {
      user: null,
      locale_code: null,
      preferred_order: 0,
      source_of_evidence: 0,
      translate_to_name: null
  }
}) {
  /**
   * @function app.models.languagePreference.LanguagePreferenceModel.isLocale
   */
  isLocale(locale) {
      var cl = clean(locale);
      var clln = clean(this.get('locale_code'));
      return clln === cl;
  }

  /**
   * @function app.models.languagePreference.LanguagePreferenceModel.isTranslateTo
   */
  isTranslateTo(locale) {
      var cl = clean(locale);
      var clln = clean(this.get('translate_to_name'));
      return clln === cl;
  }
}

/**
 * Language Preference set of the user; there is a privacy setting which will only show an array of user preferences that are bound to the user
 * @class app.models.languagePreference.LanguagePreferenceCollection
 * @extends app.models.base.BaseCollection
 */
class LanguagePreferenceCollection extends Base.Collection.extend({
  /**
   * @member {string} app.models.languagePreference.LanguagePreferenceCollection.url
   */
  url: Ctx.getApiV2DiscussionUrl("/all_users/current/language_preference"),

  /**
 * The model
 * @type {LanguagePreferenceModel}
 */
  model: LanguagePreferenceModel,

  cacheDefaultTargetLocale: undefined,
  cachePrefByLocale: undefined,

  nonLinguisticPreference: new LanguagePreferenceModel({
      source_of_evidence: 1,
      locale_code: LangString.LocaleUtils.non_linguistic
  })
}) {
  /**
   * Comparator sorts in ascending order
   * @function app.models.languagePreference.LanguagePreferenceCollection.comparator
   */
  comparator(lp) {
    if (LangString.LocaleUtils.stripCountry(lp.get("locale_code")) == Ctx.getLocale()
      && !lp.get("translate_to_name")) {
      return 0;
    }
    return 1 + lp.get("source_of_evidence") + (lp.get("preferred_order") / 100.0);
  }

  /**
   * Comparator sorts in ascending order, but explicit goes last.
   * @function app.models.languagePreference.LanguagePreferenceCollection.interface_comparator
   */
  interface_comparator(lp) {
    if (LangString.LocaleUtils.stripCountry(lp.get("locale_code")) == Ctx.getLocale()
      && !lp.get("translate_to_name")) {
      return 0;
    }
    var evidence = lp.get("source_of_evidence");
    if (!evidence) {
      evidence = 100;
    }
    return evidence + (lp.get("preferred_order") / 100.0);
  }

  /**
   * Comparator sorts in ascending order
   * @function app.models.languagePreference.LanguagePreferenceCollection.getExplicitLanguages
   */
  getExplicitLanguages() {
      return this.filter(function(entry){
          return entry.get("source_of_evidence") === 0;
      });
  }

  /**
   * @param  String locale
   * This needs to mirror UserLanguagePreferenceCollection.find_locale
   */
  getPreferenceForLocale(locale) {
    if (this.cachePrefByLocale === undefined) {
      console.warn("getPreferenceForLocale was called before getTranslationData");
      this.getTranslationData();
    }
    if (locale == LangString.LocaleUtils.non_linguistic) {
      return this.nonLinguisticPreference;
    }
    var localeParts = locale.split("_");
    for (var i = localeParts.length; i > 0; i--) {
      locale = localeParts.slice(0, i).join("_");
      var pref = this.cachePrefByLocale[locale];
      if (pref !== undefined) {
        return pref;
      }
    }
    if (LangString.LocaleUtils.localeCompatibility(this.cacheDefaultTargetLocale, locale) !== false) {
      return new LanguagePreferenceModel({
          locale_code: locale
      });
    } else {
        return new LanguagePreferenceModel({
          locale_code: locale,
          translate_to_name: this.cacheDefaultTargetLocale
        });
    }
  }

  getTranslationData() {
    // this is when we precalculate the cache
    // We might make the cache into another object someday.
    if (this.cachePrefByLocale === undefined) {
        var that = this;
        var prefByLocale = {};
        // assume this.models is sorted, just reverse
        _.map(this.models.reverse(), function(pref) {
          prefByLocale[pref.get("locale_code")] = pref;
        });
        // then add the superlocales
        this.map(function(pref) {
          var locale = pref.get("locale_code");
          locale = LangString.LocaleUtils.superLocale(locale);
          while (locale !== undefined && prefByLocale[locale] == undefined) {
            prefByLocale[locale] = pref;
            locale = LangString.LocaleUtils.superLocale(locale);
          }
        });
        // check if the translation targets are there
        this.map(function(pref) {
          var locale = pref.get("translate_to_name");
          while (locale != undefined) {
            if (prefByLocale[locale] === undefined) {
                prefByLocale[locale] = new LanguagePreferenceModel({
                    locale_code: locale,
                    source_of_evidence: 3, // LanguagePreferenceOrder.DeducedFromTranslation
                    preferred_order: pref.get("preferred_order")});
            }
            locale = LangString.LocaleUtils.superLocale(locale);
          }
        });
        this.cachePrefByLocale = prefByLocale;
        var pref;
        var i;
        for (i = 0; i < this.models.length; i++) {
          pref = this.models[i];
          if (pref.get("translate_to_name") !== null) {
            this.cacheDefaultTargetLocale = pref.get("translate_to_name");
            return this;
          }
        }
        pref = this.first();
        if (pref === undefined) {
          this.cacheDefaultTargetLocale = Ctx.getLocale();
        } else {
          this.cacheDefaultTargetLocale = pref.get("locale_code")
        }
    }
    return this;
  }

  /**
   * Creates a new languagePreference from a given local and does actions based on the succes/error callbacks
   * @param User      currentUser     The Backbone model of the current user
   * @param String    locale          The particular string of the locale to save
   * @param String    translateTo     The string of the locale that @param {locale} translates into 
   * @param Object    options         success and error callbacks
   */
  setPreference(currentUser, locale, translateTo, saveOptions) {
      //If user is not connected, then do nothing
      if (currentUser){
          // invalidate the cache
          this.cacheDefaultTargetLocale = undefined;
          this.cachePrefByLocale = undefined;
          var user_id = currentUser.id;
          var that = this;
          var saveOptions = saveOptions || {};

          var existingModel = this.find(function(model){
          //Uniqueness constraint from the back-end ensures only 1 model with such parameters
          return (
              (model.get('user') === user_id) && 
              (model.get('locale_code') === locale) &&
              (model.get('source_of_evidence') === 0))
          });

          var ops = {
              success: function(model, resp, options){
                  that.add(model);
                  if (_.has(saveOptions, "success")){
                      saveOptions.success(model, resp, options);
                  }
              },
              error: function(model, resp, options){
                  console.error("Failed to save user language preference of " + model + " to the database", resp);
                  if (_.has(saveOptions, "error")){
                      saveOptions.error(model, resp, options);
                  }
              }
          };

          if (existingModel) {
              var model = existingModel;
              ops.wait = true;
              model.save({
                  locale_code: locale,
                  translate_to_name: translateTo,
              }, ops);
          }
          else {
              var hash = {
                  locale_code: locale,
                  source_of_evidence: 0,
                  translate_to_name: translateTo,
                  user: user_id,
                  "@type": Types.LANGUAGE_PREFERENCE
              };
              var langPref = new LanguagePreferenceModel(hash, {collection: this});
              ops.wait = false;
              langPref.save(null, ops);
          }
      }
  }
}

/**
 * Language pseudo-preference-set for a disconnected user.
 * @class app.models.languagePreference.DisconnectedUserLanguagePreferenceCollection
 * @extends app.models.base.languagePreference.LanguagePreferenceModel
 */
class DisconnectedUserLanguagePreferenceCollection extends LanguagePreferenceCollection {
  getExplicitLanguages() {
      return [];
  }

  getPreferenceForLocale(locale) {
    // TODO: Cache
    var target_locale = Ctx.getLocale();
    if (LangString.LocaleUtils.localeCompatibility(target_locale, locale) !== false) {
      return new LanguagePreferenceModel({
          locale_code: locale
      });
    } else {
        return new LanguagePreferenceModel({
          locale_code: locale,
          translate_to_name: target_locale,
          source_of_evidence: 1
        });
    }
  }
}



export default {
    Model: LanguagePreferenceModel,
    Collection: LanguagePreferenceCollection,
    DisconnectedUserCollection: DisconnectedUserLanguagePreferenceCollection
}
