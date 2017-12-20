# -*- coding: utf-8 -*-
from graphql_relay.node.node import to_global_id

from assembl.graphql.schema import Schema as schema


def test_graphql_get_profile(graphql_request, participant1_user):
    res = schema.execute(u"""
query User($id: ID!) {
    user: node(id: $id) {
      ... on AgentProfile {
        id
        name
        username
        displayName
        email
        creationDate
        image { externalUrl }
      }
    }
  }
""", context_value=graphql_request, variable_values={
        "id": to_global_id('AgentProfile', participant1_user.id)
    })
    assert res.errors is None
    assert res.data['user']['name'] == u'A. Barking Loon'
    assert res.data['user']['username'] is None
    assert res.data['user']['displayName'] == u'A. Barking Loon'
    assert res.data['user']['email'] == u'abloon@gmail.com'
    # 2018-01-04T12:08:44.735489+00:00
    assert u'T' in res.data['user']['creationDate']
    assert res.data['user']['image'] is None


def test_graphql_get_profile_should_not_see_email(graphql_request, discussion_with_default_data, participant1_user, participant2_user):
    # participant2_user sould not see the email of participant1_user
    graphql_request.authenticated_userid = participant2_user.id
    res = schema.execute(u"""
query User($id: ID!) {
    user: node(id: $id) {
      ... on AgentProfile {
        id
        name
        username
        displayName
        email
      }
    }
  }
""", context_value=graphql_request, variable_values={
        "id": to_global_id('AgentProfile', participant1_user.id)
    })
    assert res.errors is None
    assert res.data['user']['name'] == u'A. Barking Loon'
    assert res.data['user']['username'] is None
    assert res.data['user']['displayName'] == u'A. Barking Loon'
    assert res.data['user']['email'] is None


def test_graphql_update_user(graphql_request, participant1_user):
    import os
    from io import BytesIO

    class FieldStorage(object):
        file = BytesIO(os.urandom(16))

        def __init__(self, filename, type):
            self.filename = filename
            self.type = type

    graphql_request.POST['variables.img'] = FieldStorage(
        u'path/to/new-img.png', 'image/png')

    res = schema.execute(u"""
mutation UpdateUser($id: ID!, $name: String!, $username: String, $img: String) {
  updateUser(
    id: $id
    name: $name
    username: $username
    image: $img
  ) {
    user {
      ... on AgentProfile {
        id
        name
        username
        displayName
        image { externalUrl }
      }
    }
  }
}
""", context_value=graphql_request, variable_values={
        "id": to_global_id('AgentProfile', participant1_user.id),
        "name": u"M. Barking Loon",
        "username": u"Barking.Loon",
        "img": u"variables.img"
    })
    assert res.errors is None
    assert res.data['updateUser']['user']['name'] == u'M. Barking Loon'
    assert res.data['updateUser']['user']['username'] == u'Barking.Loon'
    assert res.data['updateUser']['user']['displayName'] == u'M. Barking Loon'
    image = res.data['updateUser']['user']['image']
    assert '/documents/' in image['externalUrl']

    # clean up
    participant1_user.username_p = None


def test_graphql_update_user_check_username_uniqueness(graphql_request, participant1_user, participant2_user):
    class Localizer(object):
        def translate(self, value):
            return value

    graphql_request.localizer = Localizer()
    participant2_user.username_p = u"Barking.Loon"
    participant2_user.db.flush()
    res = schema.execute(u"""
mutation UpdateUser($id: ID!, $name: String!, $username: String, $img: String) {
  updateUser(
    id: $id
    name: $name
    username: $username
    image: $img
  ) {
    user {
      ... on AgentProfile {
        id
        name
        username
        displayName
        image { externalUrl }
      }
    }
  }
}
""", context_value=graphql_request, variable_values={
        "id": to_global_id('AgentProfile', participant1_user.id),
        "name": u"M. Barking Loon",
        "username": u"Barking.Loon",
    })
    assert res.errors is not None
    assert res.errors[0].message == u'We already have a user with this username.'

    # clean up
    participant2_user.username_p = None