How to perform common developper tasks
======================================
I want to:

Add a new model (frontend and backend)
--------------------------------------

See :doc:`new_class`

Download a copy of a remote database to develop locally
-------------------------------------------------------

.. code:: sh

    fab -c assembl/configs/{config_of_remote_instance}.rc database_download
    fab -c assembl/configs/develop.rc database_restore
    # Make sure the database username and passwords in local.ini match the ones of the database you just downloaded
    fab -c assembl/configs/develop.rc app_compile #(To make sure the database schema is up to date and restore.  You can also use app_compile_noupdate if you are in a hurry)
    # Grab a coffee...
    exit
    circusctl restart pserve


Run tests
---------

Only the first time you run it:

.. code:: sh

    sudo -u postgres createuser --createdb --no-createrole --no-superuser assembl_test --pwprompt  # Enter assembl_test as password at the prompt
    PGPASSWORD=assembl_test createdb --host localhost -U assembl_test assembl_test
    fab -c assembl/configs/testing.rc create_local_ini
    assembl-db-manage testing.ini bootstrap

Note that the ``fab -c assembl/configs/testing.rc create_local_ini`` command should be repeated whenever ``production.ini``, ``assembl/configs/base_env.rc`` or ``assembl/configs/testing.ini`` changes.

Thereafter:

.. code:: sh

    circusd circusd.conf
    #(wait for virtuoso to start)
    py.test --cov assembl assembl

Typically when developping a specific test:

.. code:: sh

    py.test assembl -s -k name_of_test --pdb

Python shell with database connection
-------------------------------------

.. code:: sh

    pshell iloom:local.ini

Note:  We recommend you install ipython with ``pip install ipython`` before you
run pshell.  You will get a much nicer interface

Raw sql connection
------------------

.. code:: sh

    psql -U assembl -h localhost assembl
    
