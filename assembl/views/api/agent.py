"""Cornice API for agents"""
from pyisemail import is_email
from pyramid.httpexceptions import HTTPNotFound, HTTPUnauthorized, HTTPFound
from pyramid.security import authenticated_userid
from pyramid.i18n import TranslationStringFactory
from sqlalchemy.orm import joinedload
from cornice import Service

from assembl.views.api import API_DISCUSSION_PREFIX
from assembl.auth import (P_READ, Everyone, P_SYSADMIN, P_ADMIN_DISC)
from assembl.models import (
    Discussion, AgentProfile, EmailAccount, User)

from .. import get_default_context

_ = TranslationStringFactory('assembl')

agents = Service(
    name='agents',
    path=API_DISCUSSION_PREFIX + '/agents/',
    description="Retrieve a discussion's agents.",
    renderer='json')

agent = Service(
    name='agent', path=API_DISCUSSION_PREFIX + '/agents/{id:.+}',
    description="Retrieve a single agent", renderer='json')


def _get_agents_real(request, user_id=None, view_def='default'):
    discussion = request.discussion
    user_id = user_id or Everyone
    agents = discussion.get_participants_query()
    permissions = request.permissions
    include_emails = P_ADMIN_DISC in permissions or P_SYSADMIN in permissions
    if include_emails:
        agents = agents.options(joinedload(AgentProfile.accounts))
    num_posts_per_user = \
        AgentProfile.count_posts_in_discussion_all_profiles(discussion)

    def view(agent):
        result = agent.generic_json(view_def, user_id, permissions)
        if result is None:
            return
        if include_emails or agent.id == user_id:
            result['preferred_email'] = agent.get_preferred_email()
        post_count = num_posts_per_user.get(agent.id, 0)
        if post_count:
            result['post_count'] = post_count
        return result
    return [view(agent) for agent in agents if agent is not None]


@agents.get(permission=P_READ)
def get_agents(request, discussion_only=False):
    view_def = request.GET.get('view')
    return _get_agents_real(
        request, authenticated_userid(request), view_def)


@agent.get(permission=P_READ)
def get_agent(request):
    view_def = request.GET.get('view') or 'default'
    agent_id = request.matchdict['id']
    agent = AgentProfile.get_instance(agent_id)

    if not agent:
      raise HTTPNotFound("Agent with id '%s' not found." % agent_id)
    discussion = request.context
    user_id = authenticated_userid(request) or Everyone
    permissions = request.permissions

    agent_json = agent.generic_json(view_def, user_id, permissions)
    if user_id == agent.id:
        # We probably should add all profile info here.
        agent_json['preferred_email'] = agent.get_preferred_email()
    return agent_json
