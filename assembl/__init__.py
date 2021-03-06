"""IdeaLoom is an application for Collective Intelligence.

This is the startup module, which sets up the various components:

1. A Pyramid_ WSGI app
2. The SQLAlchemy_ models_
3. Authentication with Beaker_ sessions

.. _Pyramid: http://www.pylonsproject.org/
.. _SQLAlchemy: http://www.sqlalchemy.org/
.. _Beaker: http://beaker.readthedocs.io/en/latest/
.. _models: :py:mod:`assembl.models`

"""
from __future__ import absolute_import

from pyramid.config import Configurator
from pyramid.authentication import SessionAuthenticationPolicy
from pyramid.authorization import ACLAuthorizationPolicy
from pyramid_beaker import session_factory_from_settings
from pyramid.settings import asbool
from pyramid.path import DottedNameResolver
from zope.component import getGlobalSiteManager
from sqlalchemy.ext.baked import bake_lazy_loaders

from .lib.sqla import (
    configure_engine, session_maker_is_initialized)
from .lib.locale import locale_negotiator as my_locale_negotiator
from .lib.config import set_config
from .lib.database_functions import ensure_functions

# Do not import models here, it will break tests.

resolver = DottedNameResolver(__package__)

# Do not import models here, it will break tests.
def main(global_config, **settings):
    """ Return a Pyramid WSGI application. """
    settings = dict(global_config, **settings)
    settings['config_uri'] = global_config['__file__']

    # here we create the engine and bind it to the (not really a) session
    # factory
    settings = set_config(settings)
    if not session_maker_is_initialized():
        configure_engine(settings)
    if settings.get('idealoom_debug_signal', False):
        from assembl.lib import signals
        signals.listen()

    import os
    if 'UWSGI_ORIGINAL_PROC_NAME' in os.environ:
        # uwsgi does not load logging properly
        from pyramid.paster import setup_logging
        setup_logging(global_config['__file__'])

    config = Configurator(registry=getGlobalSiteManager())
    config.include('.lib.logging')
    from .views.traversal import root_factory
    config.setup_registry(settings=settings, root_factory=root_factory)
    config.add_translation_dirs('assembl:locale/')

    config.set_locale_negotiator(my_locale_negotiator)
    config.add_tween(
        'assembl.tweens.logging.logging_tween_factory',
        over="pyramid_tm.tm_tween_factory")

    config.include('pyramid_retry')
    config.include('.auth')
    config.include('.models')
    bake_lazy_loaders()
    # Tasks first, because it includes ZCA registration (for now)
    config.include('.tasks')

    config.include('pyramid_dogpile_cache')
    config.include('.lib.zmqlib')
    session_factory = session_factory_from_settings(settings)
    config.set_session_factory(session_factory)
    if not settings.get('nosecurity', False):
        # import after session to delay loading of BaseOps
        from .auth.util import authentication_callback
        auth_policy_name = settings.get(
            "auth_policy_class", "assembl.auth.util.UpgradingSessionAuthenticationPolicy")
        auth_policy = resolver.resolve(auth_policy_name)(
            callback=authentication_callback)
        config.set_authentication_policy(auth_policy)
        config.set_authorization_policy(ACLAuthorizationPolicy())
    # ensure default roles and permissions at startup
    if not settings.get('in_migration', False):
        from .lib.migration import bootstrap_db, bootstrap_db_data
        db = bootstrap_db(settings['config_uri'])
        bootstrap_db_data(db, settings['config_uri'] != "testing.ini")

    config.add_static_view('static', 'static', cache_max_age=3600)
    config.add_static_view('widget', 'widget', cache_max_age=3600)
    config.include('cornice')  # REST services library.
    # config.include('.lib.alembic')
    # config.include('.lib.email')
    config.include('.lib')
    config.include('.views')

    # jinja2
    config.include('pyramid_jinja2')
    config.add_jinja2_extension('jinja2.ext.i18n')

    # Mailer
    if 'pyramid_mailer.debug' not in settings.get('pyramid.includes', ()):
        config.include('pyramid_mailer')

    config.include('.view_def')

    wsgi_app = config.make_wsgi_app()
    if asbool(settings.get('sqltap', False)):
        import sqltap.wsgi
        wsgi_app = sqltap.wsgi.SQLTapMiddleware(wsgi_app)
    return wsgi_app
