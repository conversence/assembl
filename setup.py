from __future__ import print_function
import os
import sys

from setuptools import setup, find_packages

here = os.path.abspath(os.path.dirname(__file__))
README = open(os.path.join(here, 'README.md')).read()
CHANGES = open(os.path.join(here, 'CHANGES.txt')).read()

from pip._internal.download import PipSession
from pip._internal.req import parse_requirements

# parse_requirements() returns generator of pip.req.InstallRequirement objects
if not os.path.exists('requirements.txt'):
    print("Please run first: fab -c configs/develop.rc ensure_requirements")
    sys.exit(0)

install_reqs = parse_requirements('requirements.txt', session=PipSession())

# requires is a list of requirement
# e.g. ['django==1.5.1', 'mezzanine==1.4.6']
requires = [str(ir.req) for ir in install_reqs
            if (not ir.markers) or ir.markers.evaluate()]

setup(name='assembl',
      version='0.0',
      description='Collective Intelligence platform',
      long_description=README + '\n\n' + CHANGES,
      classifiers=[
          "Programming Language :: Python :: 2.7",
          "Programming Language :: Javascript",
          "Framework :: Pyramid",
          "Topic :: Communications",
          "Topic :: Internet :: WWW/HTTP",
          "Topic :: Internet :: WWW/HTTP :: Dynamic Content :: Message Boards",
          "Topic :: Internet :: WWW/HTTP :: WSGI :: Application",
          "License :: OSI Approved :: GNU Affero General Public License v3",
      ],
      author='',
      author_email='',
      url='http://assembl.org/',
      license='AGPLv3',
      keywords='web wsgi pyramid',
      # find_packages misses alembic somehow.
      packages=find_packages() + ['assembl.alembic', 'assembl.alembic.versions'],
      # scripts=['fabfile.py'],
      package_data={
          'assembl': [
              'locale/*/LC_MESSAGES/*.json',
              'locale/*/LC_MESSAGES/*.mo',
              'static/js/build/*.js',
              'static/js/build/*.map',
              'static*/img/*',
              'static*/img/*/*',
              'static*/img/*/*/*',
              'static/css/fonts/*',
              'static/css/themes/default/*css',
              'static/css/themes/default/img/*',
              'static/js/app/utils/browser-detect.js',
              'static/js/bower/*/dist/css/*.css',
              'static/js/bower/*/dist/img/*',
              'static/js/bower/*/css/*.css',
              'static/js/bower/*/*.css',
              # Missing: Widgets
              'view_def/*.json',
              'configs/*.rc',
              'configs/*.ini',
              'templates/*.jinja2',
              'templates/*/*.jinja2',
              'templates/*/*/*.jinja2',
              'templates/*/*.tmpl',
              'nlp/data/*',
              'nlp/data/stopwords/*',
          ]
      },
      zip_safe=False,
      test_suite='assembl',
      setup_requires=['pip>=6'],
      install_requires=requires,
      entry_points={
        "paste.app_factory": [
            "main = assembl:main",
            "maintenance = assembl.maintenance:main",
        ],
        "console_scripts": [
            "assembl-db-manage = assembl.scripts.db_manage:main",
            "assembl-ini-files = assembl.scripts.ini_files:main",
            "assembl-imap-test = assembl.scripts.imap_test:main",
            "assembl-add-user = assembl.scripts.add_user:main",
            "assembl-pypsql = assembl.scripts.pypsql:main",
        ],
        'plaster.loader_factory': [
            'iloom+ini=assembl.lib.plaster:Loader',
            'iloom=assembl.lib.plaster:Loader',
        ],
        'plaster.wsgi_loader_factory': [
            'iloom+ini=assembl.lib.plaster:Loader',
            'iloom=assembl.lib.plaster:Loader',
        ],
      },
    )
